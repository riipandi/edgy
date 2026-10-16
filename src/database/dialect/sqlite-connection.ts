/**
 * Adapted from https://github.com/wolfie/kysely-node-native-sqlite (ISC, Copyright 2026 Henrik Paul).
 *
 * Differs from upstream: the `DatabaseSync` handle is injected because the Effect runtime owns its
 * lifecycle, and `insertId` / `numAffectedRows` are normalised to `bigint`.
 */
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely'
import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementSync } from 'node:sqlite'

/**
 * Kysely types bound parameters as `readonly unknown[]`; `node:sqlite` accepts only `SQLInputValue`.
 * The assertion lives here because Kysely only compiles literals `node:sqlite` can bind.
 */
const bindable = (parameters: CompiledQuery['parameters']): SQLInputValue[] => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return parameters as SQLInputValue[]
}

/** Rows are untyped `node:sqlite` records; the caller names the row shape `R`. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const asRows = <R>(rows: Record<string, SQLOutputValue>[]): R[] => rows as R[]

/**
 * Whether a query returns rows. The Kysely AST decides where it can: `SELECT` always does, writes
 * only with `RETURNING`. Raw SQL is decided by its result columns, since sniffing the leading keyword
 * misses `explain query plan`.
 */
const returnsRows = (
  query: CompiledQuery['query'],
  sql: string,
  statement: StatementSync
): boolean => {
  if (query.kind === 'SelectQueryNode') return true

  if (
    query.kind === 'InsertQueryNode' ||
    query.kind === 'UpdateQueryNode' ||
    query.kind === 'DeleteQueryNode'
  ) {
    return sql.toLowerCase().includes('returning')
  }

  if (query.kind === 'RawNode') return statement.columns().length > 0

  return false
}

/** Prepared statements cached per connection. Repeated query shapes reuse the same SQL text. */
const STATEMENT_CACHE_SIZE = 128

/** A Kysely {@link DatabaseConnection} backed by a synchronous `node:sqlite` handle. */
export class NodeSQLiteConnection implements DatabaseConnection {
  readonly #db: DatabaseSync
  /** Map order is recency: a hit is re-inserted, and the oldest key is evicted past the limit. */
  readonly #statements = new Map<string, StatementSync>()

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  #prepare(sql: string): StatementSync {
    const cached = this.#statements.get(sql)
    if (cached !== undefined) {
      this.#statements.delete(sql)
      this.#statements.set(sql, cached)
      return cached
    }

    const statement = this.#db.prepare(sql)
    this.#statements.set(sql, statement)
    if (this.#statements.size > STATEMENT_CACHE_SIZE) {
      const oldest = this.#statements.keys().next()
      if (oldest.done !== true) this.#statements.delete(oldest.value)
    }
    return statement
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery
    const statement = this.#prepare(sql)

    if (returnsRows(compiledQuery.query, sql, statement)) {
      return { rows: asRows<R>(statement.all(...bindable(parameters))) }
    }

    const result = statement.run(...bindable(parameters))
    return {
      rows: [],
      insertId: BigInt(result.lastInsertRowid),
      numAffectedRows: BigInt(result.changes)
    }
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    // `node:sqlite` has no cursor API, so the full result is materialised and yielded as one chunk.
    const result = await this.executeQuery<R>(compiledQuery)
    if (result.rows) yield { rows: result.rows }
  }
}
