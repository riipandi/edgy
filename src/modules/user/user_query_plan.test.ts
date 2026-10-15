import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { sql } from 'kysely'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { DatabaseService } from '../../database/service.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
})
afterAll(() => t.dispose())

/** What SQLite says it will do for a statement: one line per step. */
const planOf = (statement: ReturnType<typeof sql>) =>
  t.run(
    DatabaseService.use(({ db }) =>
      Effect.promise(async () => {
        const { rows } = await statement.execute(db)
        return rows.map((row) => String((row as { detail: unknown }).detail))
      })
    )
  )

describe('query plans of the user list', () => {
  it('orders by name and id from an index, with no sort of the whole table', async () => {
    const plan = await planOf(
      sql`explain query plan select * from users order by name, id limit 20`
    )
    expect(plan.join(' | ')).toContain('users_name_id_idx')
    expect(plan.join(' | ')).not.toContain('TEMP B-TREE')
  })

  it('orders by the primary key, and by email through its unique index', async () => {
    const byId = await planOf(sql`explain query plan select * from users order by id limit 20`)
    expect(byId.join(' | ')).not.toContain('TEMP B-TREE')

    const byEmail = await planOf(
      sql`explain query plan select * from users order by email, id limit 20`
    )
    expect(byEmail.join(' | ')).toContain('USING INDEX')
  })
})
