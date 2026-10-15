import { describe, expect, it } from '@effect/vitest'
import { Duration, Effect, Exit } from 'effect'
import { Persistence } from 'effect/persistence'
import { type EdgeCache, layerBackingEdgeCache } from './edge_cache.ts'

/** The Cache API in a `Map`: keeps the `Response`s it was given, keyed by URL. */
const fakeEdge = () => {
  const stored = new Map<string, Response>()
  const cache: EdgeCache = {
    match: async (request) => stored.get(request.url)?.clone(),
    put: async (request, response) => {
      stored.set(request.url, response)
    },
    delete: async (request) => stored.delete(request.url)
  }
  return { cache, stored }
}

const storeOn = (cache: EdgeCache) =>
  Effect.gen(function* () {
    const backing = yield* Persistence.BackingPersistence
    return yield* backing.make('edgy:cache:users')
    // A test helper is its own entry point: it builds one layer, once, for one store.
    // oxlint-disable-next-line effecttsgo/strict-effect-provide
  }).pipe(Effect.provide(layerBackingEdgeCache(cache)))

describe('Cache API store', () => {
  it.effect('round-trips a value under a URL made from the store and the key', () =>
    Effect.gen(function* () {
      const { cache, stored } = fakeEdge()
      const store = yield* storeOn(cache)

      yield* store.set('user_1', { name: 'Ada' }, Duration.seconds(30))
      expect(yield* store.get('user_1')).toEqual({ name: 'Ada' })
      expect([...stored.keys()]).toEqual(['https://edgy.cache/edgy%3Acache%3Ausers/user_1'])
      expect(yield* store.get('user_2')).toBeUndefined()
    })
  )

  it.effect('expires an entry through max-age, in whole seconds and at least one', () =>
    Effect.gen(function* () {
      const { cache, stored } = fakeEdge()
      const store = yield* storeOn(cache)
      const maxAge = (key: string) =>
        stored.get(`https://edgy.cache/edgy%3Acache%3Ausers/${key}`)?.headers.get('cache-control')

      yield* store.set('a', {}, Duration.millis(30_000))
      yield* store.set('b', {}, Duration.millis(1_200))
      yield* store.set('c', {}, Duration.millis(10))
      yield* store.set('d', {}, undefined)
      expect(maxAge('a')).toBe('public, max-age=30')
      expect(maxAge('b')).toBe('public, max-age=2')
      expect(maxAge('c')).toBe('public, max-age=1')
      expect(maxAge('d')).toBe('public, max-age=86400')
    })
  )

  it.effect('removes an entry, and clear is a no-op because the API cannot purge', () =>
    Effect.gen(function* () {
      const { cache, stored } = fakeEdge()
      const store = yield* storeOn(cache)
      yield* store.set('a', { n: 1 }, Duration.seconds(5))

      yield* store.clear
      expect(stored.size).toBe(1)
      yield* store.remove('a')
      expect(yield* store.get('a')).toBeUndefined()
    })
  )

  it.effect('treats a body that is not a JSON object as a miss', () =>
    Effect.gen(function* () {
      const { cache, stored } = fakeEdge()
      const store = yield* storeOn(cache)
      stored.set('https://edgy.cache/edgy%3Acache%3Ausers/junk', new Response('not json'))
      expect(yield* store.get('junk')).toBeUndefined()
    })
  )

  it.effect('reports a failing Cache API as a PersistenceError', () =>
    Effect.gen(function* () {
      const store = yield* storeOn({
        match: () => Promise.reject(new Error('boom')),
        put: () => Promise.reject(new Error('boom')),
        delete: () => Promise.reject(new Error('boom'))
      })
      const exit = yield* Effect.exit(store.get('a'))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(JSON.stringify(exit)).toContain('PersistenceError')
    })
  )
})
