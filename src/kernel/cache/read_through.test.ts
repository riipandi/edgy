import { describe, expect, layer } from '@effect/vitest'
import { Data, Deferred, Effect, Exit, Fiber, Schema } from 'effect'
import { Persistable, Persistence } from 'effect/persistence'
import { TestClock } from 'effect/testing'
import { cacheEnvironment, fakeBacking, makeFakeStore } from '../../../tests/cache.ts'
import { guardBacking } from './guard.ts'
import { CacheBypass, makeReadThrough } from './read_through.ts'

class Broken extends Data.TaggedError('Broken')<{ readonly why: string }> {}

class Item extends Persistable.Class<{ payload: { readonly id: string } }>()('Item', {
  primaryKey: ({ id }) => id,
  success: Schema.Struct({ id: Schema.String, n: Schema.Finite }),
  error: Schema.instanceOf(Broken)
}) {}

/** A lookup that counts how often the source was reached, and can be told to fail. */
const source = () => {
  let calls = 0
  let failures = 0
  return {
    calls: () => calls,
    failNext: (times: number) => {
      failures = times
    },
    lookup: (key: Item) =>
      Effect.suspend(() => {
        calls += 1
        return failures-- > 0
          ? Effect.fail(new Broken({ why: 'source is down' }))
          : Effect.succeed({ id: key.id, n: calls })
      })
  }
}

const read = (origin: ReturnType<typeof source>) =>
  makeReadThrough({ name: 'items', lookup: origin.lookup })

describe('read-through, memory store', () => {
  layer(cacheEnvironment())('on', (scoped) => {
    scoped.effect('serves the second read from the cache, and forgets on invalidate', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)

        const first = yield* cache.get(new Item({ id: 'a' }))
        const second = yield* cache.get(new Item({ id: 'a' }))
        expect(second).toEqual(first)
        expect(origin.calls()).toBe(1)

        yield* cache.invalidate(new Item({ id: 'a' }))
        yield* cache.get(new Item({ id: 'a' }))
        expect(origin.calls()).toBe(2)
      })
    )

    scoped.effect('keeps entries apart by key', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)
        yield* cache.get(new Item({ id: 'x' }))
        yield* cache.get(new Item({ id: 'y' }))
        expect(origin.calls()).toBe(2)
      })
    )

    scoped.effect('does not keep a failure: the next read asks the source again', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)

        origin.failNext(1)
        const failed = yield* Effect.exit(cache.get(new Item({ id: 'f' })))
        expect(Exit.isFailure(failed)).toBe(true)

        const retried = yield* cache.get(new Item({ id: 'f' }))
        expect(retried.id).toBe('f')
        expect(origin.calls()).toBe(2)
      })
    )

    scoped.effect(
      'skips the cache for a request that asks (nocache), and leaves it untouched',
      () =>
        Effect.gen(function* () {
          const origin = source()
          const cache = yield* read(origin)
          const bypassed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
            Effect.provideService(effect, CacheBypass, true)

          yield* bypassed(cache.get(new Item({ id: 'b' })))
          yield* bypassed(cache.get(new Item({ id: 'b' })))
          expect(origin.calls()).toBe(2)

          // nothing was stored by the bypassed reads: this one fills the cache, the next is a hit
          yield* cache.get(new Item({ id: 'b' }))
          yield* cache.get(new Item({ id: 'b' }))
          expect(origin.calls()).toBe(3)
        })
    )
  })

  layer(cacheEnvironment({ CACHE_ENABLED: 'false' }))('off', (scoped) => {
    scoped.effect('reads the source every time', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)
        yield* cache.get(new Item({ id: 'a' }))
        yield* cache.get(new Item({ id: 'a' }))
        yield* cache.invalidate(new Item({ id: 'a' }))
        expect(origin.calls()).toBe(2)
      })
    )
  })
})

describe('read-through, shared store', () => {
  const store = makeFakeStore()
  const env = { CACHE_STORE: 'redis', CACHE_LOCAL_TTL: '0' }

  // one store, two layers: two processes
  layer(cacheEnvironment(env, fakeBacking(store)))('process A', (scoped) => {
    scoped.effect('writes what it read to the store', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)
        yield* cache.get(new Item({ id: 'shared' }))
        expect(store.calls.set).toBe(1)
        expect([...store.entries.keys()]).toEqual(['edgy:cache:items:shared'])
      })
    )
  })

  layer(cacheEnvironment(env, fakeBacking(store)))('process B', (scoped) => {
    scoped.effect('is served from the store, and forgets there too when told to', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)

        yield* cache.get(new Item({ id: 'shared' }))
        expect(origin.calls()).toBe(0) // process A's entry answered

        yield* cache.invalidate(new Item({ id: 'shared' }))
        expect(store.entries.size).toBe(0)
        yield* cache.get(new Item({ id: 'shared' }))
        expect(origin.calls()).toBe(1)
      })
    )
  })

  const damaged = makeFakeStore()
  damaged.entries.set('edgy:cache:items:odd', { not: 'an exit' })
  layer(cacheEnvironment(env, fakeBacking(damaged)))(
    'an entry that no longer decodes',
    (scoped) => {
      scoped.effect('is a miss: the source answers and the request does not fail', () =>
        Effect.gen(function* () {
          const origin = source()
          const cache = yield* read(origin)
          const item = yield* cache.get(new Item({ id: 'odd' }))
          expect(item.id).toBe('odd')
          expect(origin.calls()).toBe(1)

          // the damaged entry was dropped, so the next read replaces it and the one after hits
          yield* cache.get(new Item({ id: 'odd' }))
          yield* cache.get(new Item({ id: 'odd' }))
          expect(origin.calls()).toBe(2)
        })
      )
    }
  )
})

describe('a write that lands while a read is in flight', () => {
  /** The first lookup waits on `gate`, standing for a read that began before a write. */
  const slowFirst = (gate: Deferred.Deferred<void>) => {
    let calls = 0
    return {
      calls: () => calls,
      lookup: (key: Item) =>
        Effect.gen(function* () {
          calls += 1
          const mine = calls
          if (mine === 1) yield* Deferred.await(gate)
          return { id: key.id, n: mine }
        })
    }
  }

  const scenario = Effect.fnUntraced(function* () {
    const gate = yield* Deferred.make<void>()
    const origin = slowFirst(gate)
    const cache = yield* makeReadThrough({ name: 'items', lookup: origin.lookup })
    const key = new Item({ id: 'race' })

    const reading = yield* Effect.forkChild(cache.get(key)) // began before the write
    yield* Effect.yieldNow
    yield* cache.invalidate(key) // the write commits and announces it
    yield* Deferred.succeed(gate, undefined) // the old read finishes afterwards
    const old = yield* Fiber.join(reading)

    const next = yield* cache.get(key)
    return { old, next, calls: origin.calls() }
  })

  for (const [title, env, backing] of [
    ['in the process', {}, undefined],
    ['in a shared store', { CACHE_STORE: 'redis', CACHE_LOCAL_TTL: '0' }, makeFakeStore()]
  ] as const) {
    layer(cacheEnvironment(env, backing && fakeBacking(backing)))(title, (scoped) => {
      scoped.effect('does not leave the old value cached: the next read looks again', () =>
        Effect.gen(function* () {
          const { old, next, calls } = yield* scenario()
          expect(old.n).toBe(1) // the in-flight read gets what it read
          expect(next.n).toBe(2) // but nobody after the write is served it
          expect(calls).toBe(2)
        })
      )
    })
  }
})

describe('a shared store that comes back', () => {
  const store = makeFakeStore()

  layer(guardBacking(fakeBacking(store, 'fail')))('after an outage', (scoped) => {
    scoped.effect('is probed by one call, not by every caller at once', () =>
      Effect.gen(function* () {
        const backing = yield* Persistence.BackingPersistence
        const guarded = yield* backing.make('probe')

        yield* guarded.get('a') // fails and starts the cooldown
        expect(store.calls.get).toBe(1)
        yield* guarded.get('b') // inside the cooldown: not asked
        expect(store.calls.get).toBe(1)

        yield* TestClock.adjust('11 seconds')
        yield* Effect.all([guarded.get('c'), guarded.get('d'), guarded.get('e')], {
          concurrency: 'unbounded'
        })
        expect(store.calls.get).toBe(2) // one probe among three concurrent callers
      })
    )
  })
})

describe('a shared store that is down', () => {
  const down = makeFakeStore()
  const env = { CACHE_STORE: 'redis', CACHE_LOCAL_TTL: '0' }

  layer(cacheEnvironment(env, guardBacking(fakeBacking(down, 'fail'))))('failing', (scoped) => {
    scoped.effect('costs the entries, not the requests, and is not asked again meanwhile', () =>
      Effect.gen(function* () {
        const origin = source()
        const cache = yield* read(origin)

        for (const id of ['p', 'q', 'r']) {
          const item = yield* cache.get(new Item({ id }))
          expect(item.id).toBe(id)
        }
        expect(origin.calls()).toBe(3)
        // the first read asked the store, failed and started the cooldown; the rest never asked
        expect(down.calls.get).toBe(1)
      })
    )
  })

  layer(cacheEnvironment(env, guardBacking(fakeBacking(makeFakeStore(), 'hang'))))(
    'hanging',
    (scoped) => {
      scoped.effect('is given up on after the timeout, by the clock', () =>
        Effect.gen(function* () {
          const origin = source()
          const cache = yield* read(origin)
          // TestClock is on: a hung store only ends because the guard's timeout is reached
          const reading = yield* Effect.forkChild(Effect.exit(cache.get(new Item({ id: 'slow' }))))
          yield* TestClock.adjust('300 millis')
          const item = yield* Fiber.join(reading)
          expect(Exit.isSuccess(item)).toBe(true)
          expect(origin.calls()).toBe(1)
        })
      )
    }
  )
})
