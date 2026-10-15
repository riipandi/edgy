/**
 * Adapted from https://github.com/aidenwallis/kysely-d1 (MIT).
 *
 * Differs from upstream: the Cloudflare types are declared locally, because `@cloudflare/workers-types`
 * globals clash with the Node typings. D1 failures are rethrown unchanged so a uniqueness violation
 * can be recognised from the message.
 */
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely'

/** Subset of Cloudflare's D1 types used by this dialect. */
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

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

/** A Kysely {@link DatabaseConnection} over a D1 binding. Each statement is its own request. */
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
