/**
 * Portion of this file forked from https://github.com/aidenwallis/kysely-d1
 * (MIT License).
 *
 * Adaptations for this project:
 * - The Cloudflare types are declared locally ({@link D1Database}) so the
 *   package needs no `@cloudflare/workers-types`, whose globals clash with the
 *   Node typings the rest of the project compiles against.
 * - Failures from D1 are rethrown as they are, so the repository layer can
 *   recognise a uniqueness violation from the message.
 */
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely'

/** The slice of Cloudflare's `D1PreparedStatement` this dialect uses. */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  all(): Promise<D1Result>
}

export interface D1Result {
  readonly results?: unknown[]
  readonly error?: string
  readonly meta?: {
    readonly changes?: number
    readonly last_row_id?: number | null
  }
}

/** The slice of Cloudflare's `D1Database` binding this dialect uses. */
export interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

/**
 * A Kysely {@link DatabaseConnection} over a D1 binding. D1 executes each
 * statement as its own request, so there is no connection to hold and nothing
 * to serialise (unlike the synchronous `node:sqlite` handle).
 */
export class D1Connection implements DatabaseConnection {
  readonly #database: D1Database

  constructor(database: D1Database) {
    this.#database = database
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.#database
      .prepare(compiledQuery.sql)
      .bind(...compiledQuery.parameters)
      .all()

    if (result.error !== undefined) throw new Error(result.error)

    const changes = result.meta?.changes ?? 0
    const lastRowId = result.meta?.last_row_id

    return {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      rows: (result.results ?? []) as R[],
      ...(changes > 0 ? { numAffectedRows: BigInt(changes) } : {}),
      ...(lastRowId === undefined || lastRowId === null ? {} : { insertId: BigInt(lastRowId) })
    }
  }

  // oxlint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('D1 does not support streaming queries')
  }
}
