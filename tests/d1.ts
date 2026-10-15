import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { D1Database } from '../src/database/d1.ts'

export interface FakeD1Options {
  /**
   * Make the first `times` read statements fail with `message`, then behave. Reads are
   * what `DatabaseService.read` retries, so this is how a test produces a transient
   * network failure without a network.
   */
  readonly failReads?: { readonly times: number; readonly message: string }
}

/**
 * A D1 binding backed by an in-memory `node:sqlite` database. It mimics the observable
 * differences that matter to the dialect: results come back as `{ results, meta }`, and a
 * constraint failure carries only a message. `statements()` counts what reached it, which
 * is how a test tells whether a failed call was repeated.
 */
export const fakeD1 = (options: FakeD1Options = {}): D1Database & { statements: () => number } => {
  const sqlite = new DatabaseSync(':memory:')
  let seen = 0
  let readFailures = 0

  return {
    statements: () => seen,
    prepare: (sql) => {
      let params: unknown[] = []
      const prepared = {
        bind: (...values: unknown[]) => {
          params = values
          return prepared
        },
        all: async () => {
          seen += 1
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const bound = params as SQLInputValue[]
          const isRead = /^\s*(select|with|pragma)/i.test(sql) || /returning/i.test(sql)
          try {
            const statement = sqlite.prepare(sql)
            if (isRead) {
              const { failReads } = options
              if (
                failReads !== undefined &&
                /^\s*select/i.test(sql) &&
                readFailures < failReads.times
              ) {
                readFailures += 1
                throw new Error(failReads.message)
              }
              return { results: statement.all(...bound), meta: { changes: 0 } }
            }
            const result = statement.run(...bound)
            return {
              results: [],
              meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(
              message.startsWith('D1_ERROR') ? message : `D1_ERROR: ${message}: SQLITE_CONSTRAINT`,
              {
                cause: error
              }
            )
          }
        }
      }
      return prepared
    }
  }
}
