import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Effect, Exit, Layer, Logger, ManagedRuntime } from 'effect'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { fakeD1 } from '../../tests/d1.ts'
import { userRow } from '../../tests/ids.ts'
import { Conflict, DatabaseError } from '../kernel/errors.ts'
import { UserRepository } from '../modules/user/user_repo.ts'
import { D1Binding, D1DatabaseLayer } from './d1.ts'
import { migrateDown, migrateToLatest } from './migrator.ts'
import { DatabaseService, isUniqueViolation } from './service.ts'

describe('the sqlite driver’s transactions', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await makeTestApp()
  })
  afterAll(() => t.dispose())

  const count = () =>
    t.run(
      DatabaseService.use(({ query }) =>
        query((db) =>
          db
            .selectFrom('users')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .executeTakeFirstOrThrow()
        )
      )
    )

  it('commits when the callback resolves', async () => {
    const before = (await count()).n
    await t.run(
      DatabaseService.use(({ db }) =>
        Effect.promise(() =>
          db.transaction().execute(async (trx) => {
            await trx.insertInto('users').values(userRow('tx1@example.com')).execute()
            await trx.insertInto('users').values(userRow('tx2@example.com')).execute()
          })
        )
      )
    )
    expect((await count()).n).toBe(before + 2)
  })

  it('rolls back when the callback rejects', async () => {
    const before = (await count()).n
    const exit = await t.run(
      Effect.exit(
        DatabaseService.use(({ db }) =>
          Effect.tryPromise(() =>
            db.transaction().execute(async (trx) => {
              await trx.insertInto('users').values(userRow('tx3@example.com')).execute()
              throw new Error('boom')
            })
          )
        )
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect((await count()).n).toBe(before)
  })
})

describe('isUniqueViolation', () => {
  it('recognises the node:sqlite code and the D1 message', () => {
    expect(isUniqueViolation(new DatabaseError({ cause: { errcode: 2067 } }))).toBe(true)
    expect(isUniqueViolation(new DatabaseError({ cause: { errcode: 1555 } }))).toBe(true)
    expect(
      isUniqueViolation(
        new DatabaseError({ cause: new Error('D1_ERROR: UNIQUE constraint failed: users.email') })
      )
    ).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isUniqueViolation(new DatabaseError({ cause: new Error('no such table') }))).toBe(false)
    expect(isUniqueViolation(new DatabaseError({ cause: 'text' }))).toBe(false)
  })
})

describe('D1 dialect', () => {
  const layer = UserRepository.layer.pipe(
    Layer.provideMerge(D1DatabaseLayer),
    Layer.provide(Layer.succeed(D1Binding, fakeD1())),
    // No logger: the default one would print the migrator's warnings into the test run.
    Layer.provideMerge(Logger.layer([]))
  )
  const runtime = ManagedRuntime.make(layer)
  afterAll(() => runtime.dispose())

  it('runs migrations through the D1-safe introspector', async () => {
    const applied = await runtime.runPromise(migrateToLatest)
    expect(applied.map((result) => result.status)).toEqual(['Success'])

    const again = await runtime.runPromise(migrateToLatest)
    expect(again).toEqual([])
  })

  it('reads and writes through the repository, with a Conflict on duplicates', async () => {
    const created = await runtime.runPromise(
      UserRepository.use((users) => users.insert({ email: 'd1@example.com', name: 'D1' }))
    )
    expect(created).toMatchObject({ email: 'd1@example.com', name: 'D1' })

    const page = await runtime.runPromise(
      UserRepository.use((users) => users.findPage({ limit: 10, sortBy: 'id', sortOrder: 'asc' }))
    )
    expect(page.items).toHaveLength(1)
    expect(page.next).toBeNull()

    const duplicate = await runtime.runPromise(
      Effect.flip(
        UserRepository.use((users) => users.insert({ email: 'd1@example.com', name: 'D One' }))
      )
    )
    expect(duplicate).toBeInstanceOf(Conflict)
  })

  it('refuses an interactive transaction, since D1 has none', async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        DatabaseService.use(({ db }) =>
          Effect.tryPromise({
            try: () => db.transaction().execute(async () => 'never'),
            catch: (cause) => new DatabaseError({ cause })
          })
        )
      )
    )
    expect(error).toBeInstanceOf(DatabaseError)
  })

  it('rolls migrations back', async () => {
    const results = await runtime.runPromise(migrateDown(1))
    expect(results.map((result) => result.status)).toEqual(['Success'])
  })
})
