import { describe, expect, it, layer } from '@effect/vitest'
import { Effect, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { sql } from 'kysely'
import { type FakeD1Options, fakeD1 } from '../../tests/d1.ts'
import { DatabaseError } from '../kernel/errors.ts'
import { D1Binding, D1DatabaseLayer } from './d1.ts'
import { DatabaseService, isTransientFailure } from './service.ts'

const selectOne = DatabaseService.use(({ read }) =>
  read(
    async (db) =>
      (await sql<{ name: string }>`select name from sqlite_master limit 1`.execute(db)).rows
  )
)

const insertOne = DatabaseService.use(({ query }) =>
  query((db) => db.insertInto('users').values({ email: 'w@x.io', name: null }).execute())
)

/** Runs the effect on a fiber, steps the TestClock past every backoff, and returns its exit. */
const settle = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(Effect.exit(effect))
    yield* TestClock.adjust('5 seconds')
    return yield* Fiber.join(fiber)
  })

describe('isTransientFailure', () => {
  const failing = (message: string) => new DatabaseError({ cause: new Error(message) })

  it('recognises failures that go away on their own', () => {
    for (const message of [
      'D1_ERROR: Network connection lost',
      'D1_ERROR: D1 DB is overloaded. Requests queued for too long.',
      'D1_ERROR: storage operation exceeded timeout which caused object to be reset',
      'SQLITE_BUSY: database is locked'
    ]) {
      expect(isTransientFailure(failing(message))).toBe(true)
    }
  })

  it('does not call a deterministic failure transient', () => {
    expect(isTransientFailure(failing('D1_ERROR: UNIQUE constraint failed: users.email'))).toBe(
      false
    )
    expect(isTransientFailure(failing('D1_ERROR: no such table: nope'))).toBe(false)
    expect(isTransientFailure(new DatabaseError({ cause: 'plain text' }))).toBe(false)
  })
})

/**
 * One scenario per fake binding: the layer (and so the fake's statement counter) is
 * shared by the tests inside it, which is why each scenario holds a single test.
 */
const scenario = (
  title: string,
  options: FakeD1Options,
  program: Effect.Effect<unknown, DatabaseError, DatabaseService>,
  expected: { readonly exit: 'Success' | 'Failure'; readonly statements: number }
) => {
  const binding = fakeD1(options)
  const database = D1DatabaseLayer.pipe(Layer.provide(Layer.succeed(D1Binding, binding)))

  layer(database)(`DatabaseService.read on D1: ${title}`, (scoped) => {
    scoped.effect('behaves as specified', () =>
      Effect.gen(function* () {
        const exit = yield* settle(program)
        expect(exit._tag).toBe(expected.exit)
        expect(binding.statements()).toBe(expected.statements)
      })
    )
  })
}

scenario(
  'repeats a transient failure, then succeeds',
  { failReads: { times: 2, message: 'D1_ERROR: Network connection lost' } },
  selectOne,
  { exit: 'Success', statements: 3 } // two failures, then the attempt that worked
)

scenario(
  'gives up after two repeats',
  { failReads: { times: 99, message: 'D1_ERROR: Network connection lost' } },
  selectOne,
  { exit: 'Failure', statements: 3 }
)

scenario(
  'does not repeat a failure that cannot change',
  { failReads: { times: 99, message: 'D1_ERROR: no such table: nope' } },
  selectOne,
  { exit: 'Failure', statements: 1 }
)

scenario(
  'never repeats a write',
  { failReads: { times: 99, message: 'D1_ERROR: Network connection lost' } },
  insertOne, // fails once because the table does not exist; the point is it is not retried
  { exit: 'Failure', statements: 1 }
)
