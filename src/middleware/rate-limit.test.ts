import { it } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import { Database, makeDatabaseService } from '#/database/adapter.ts'
import { openDatabase } from '#/database/dialect/sqlite.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { RateLimitCounter, RateLimitCounterLayerDatabase } from './rate-limit.ts'

const database = Layer.effect(
  Database,
  Effect.gen(function* () {
    const db = openDatabase(':memory:')
    const result = yield* Effect.tryPromise({
      try: () => migrateToLatest(db),
      catch: (cause) => new Error(String(cause))
    })
    if (result.error !== undefined) return yield* Effect.fail(new Error('migration failed'))
    return makeDatabaseService(db)
  })
)
const counterLayer = RateLimitCounterLayerDatabase.pipe(Layer.provide(database))

const program = Effect.gen(function* () {
  const counter = yield* RateLimitCounter

  const first = yield* counter.consume('testclock', 2, Duration.seconds(60))
  expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1, resetSeconds: 60 })
  const second = yield* counter.consume('testclock', 2, Duration.seconds(60))
  expect(second).toMatchObject({ allowed: true, remaining: 0 })
  const third = yield* counter.consume('testclock', 2, Duration.seconds(60))
  expect(third).toMatchObject({ allowed: false, remaining: 0 })

  // The window has not elapsed yet: still blocked.
  yield* TestClock.adjust('30 seconds')
  expect(yield* counter.consume('testclock', 2, Duration.seconds(60))).toMatchObject({
    allowed: false
  })

  // Crossing the 60-second boundary opens a fresh window and prunes the
  // expired one. Fixed windows are aligned to the clock, so the fresh
  // window's reset counts down to the next bucket boundary.
  yield* TestClock.adjust('31 seconds')
  const fresh = yield* counter.consume('testclock', 2, Duration.seconds(60))
  expect(fresh.allowed).toBe(true)
  expect(fresh.resetSeconds).toBeGreaterThan(0)
  expect(fresh.resetSeconds).toBeLessThanOrEqual(60)

  const database_ = yield* Database
  const rows = yield* database_.query((db) => db.selectFrom('rate_limits').selectAll().execute())
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ key: 'testclock', count: 1 })
})

it.effect('fixed window over sqlite', () =>
  program.pipe(Effect.provide(counterLayer), Effect.provide(database))
)
