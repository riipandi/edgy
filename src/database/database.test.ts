import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { Conflict, DatabaseError } from '../kernel/errors.ts'
import { UserRepository } from '../modules/user/user_repo.ts'
import { D1Binding, D1DatabaseLayer, type D1Database } from './d1.ts'
import { migrateDown, migrateToLatest } from './migrator.ts'
import { DatabaseService, isUniqueViolation } from './service.ts'

describe('transactions (sqlite)', () => {
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
      DatabaseService.use(({ transaction }) =>
        transaction(async (trx) => {
          await trx.insertInto('users').values({ email: 'tx1@example.com', name: null }).execute()
          await trx.insertInto('users').values({ email: 'tx2@example.com', name: null }).execute()
        })
      )
    )
    expect((await count()).n).toBe(before + 2)
  })

  it('rolls back when the callback rejects, and reports a DatabaseError', async () => {
    const before = (await count()).n
    const exit = await t.run(
      Effect.exit(
        DatabaseService.use(({ transaction }) =>
          transaction(async (trx) => {
            await trx.insertInto('users').values({ email: 'tx3@example.com', name: null }).execute()
            throw new Error('boom')
          })
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

/**
 * A D1 binding backed by an in-memory `node:sqlite` database. It mimics the two
 * observable differences that matter to the dialect: results come back as
 * `{ results, meta }`, and a constraint failure carries only a message.
 */
const fakeD1 = (): D1Database => {
  const sqlite = new DatabaseSync(':memory:')
  return {
    prepare: (sql) => {
      const statement = sqlite.prepare(sql)
      let params: unknown[] = []
      const prepared = {
        bind: (...values: unknown[]) => {
          params = values
          return prepared
        },
        all: async () => {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const bound = params as SQLInputValue[]
          try {
            if (/^\s*(select|with|pragma)/i.test(sql) || /returning/i.test(sql)) {
              return { results: statement.all(...bound), meta: { changes: 0 } }
            }
            const result = statement.run(...bound)
            return {
              results: [],
              meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`D1_ERROR: ${message}: SQLITE_CONSTRAINT`, { cause: error })
          }
        }
      }
      return prepared
    }
  }
}

describe('D1 dialect', () => {
  const layer = UserRepository.layer.pipe(
    Layer.provideMerge(D1DatabaseLayer),
    Layer.provide(Layer.succeed(D1Binding, fakeD1()))
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
      UserRepository.use((users) =>
        users.findPage({ page: 1, limit: 10, offset: 0, sortBy: 'id', sortOrder: 'asc' })
      )
    )
    expect(page.total).toBe(1)

    const duplicate = await runtime.runPromise(
      Effect.flip(UserRepository.use((users) => users.insert({ email: 'd1@example.com' })))
    )
    expect(duplicate).toBeInstanceOf(Conflict)
  })

  it('refuses transactions, since D1 has none', async () => {
    const error = await runtime.runPromise(
      Effect.flip(DatabaseService.use(({ transaction }) => transaction(async () => 'never')))
    )
    expect(error).toBeInstanceOf(DatabaseError)
  })

  it('rolls migrations back', async () => {
    const results = await runtime.runPromise(migrateDown(1))
    expect(results.map((result) => result.status)).toEqual(['Success'])
  })
})
