/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Adaptations for this project:
 * - The `node:sqlite` `DatabaseSync` handle is injected instead of being
 *   constructed here, because its lifecycle is owned by the Effect runtime
 *   (`Effect.acquireRelease` in `database/service.ts`).
 * - `insertId` / `numAffectedRows` are normalised to `bigint`.
 */
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely'
import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementSync } from 'node:sqlite'

/**
 * Kysely exposes bound parameters as `readonly unknown[]`, while `node:sqlite`
 * only accepts its own `SQLInputValue` union. Narrowing is impossible without
 * runtime reflection, so the driver asserts at this single boundary — Kysely
 * always compiles literals that `node:sqlite` is able to bind.
 */
const bindable = (parameters: CompiledQuery['parameters']): SQLInputValue[] => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return parameters as SQLInputValue[]
}

/**
 * Rows leave `node:sqlite` as `Record<string, SQLOutputValue>[]`; Kysely's
 * `QueryResult<R>` is generic over the row shape the caller expects. The cast
 * is the documented responsibility of a driver implementation.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const asRows = <R>(rows: Record<string, SQLOutputValue>[]): R[] => rows as R[]

/**
 * Reads rows via `StatementSync.all()` when the compiled query produces a
 * result set, otherwise executes it with `run()`.
 *
 * `node:sqlite` offers no way to ask a statement whether it returns rows, so
 * the decision is derived from the compiled Kysely AST: `SELECT` always returns
 * rows; writes only when they carry a `RETURNING` clause; raw statements are
 * sniffed from their leading keyword.
 */
const returnsRows = (query: CompiledQuery['query'], sql: string): boolean => {
  if (query.kind === 'SelectQueryNode') return true

  if (
    query.kind === 'InsertQueryNode' ||
    query.kind === 'UpdateQueryNode' ||
    query.kind === 'DeleteQueryNode'
  ) {
    return sql.toLowerCase().includes('returning')
  }

  if (query.kind === 'RawNode') {
    const lowerSql = sql.toLowerCase().trim()
    return (
      lowerSql.startsWith('select') ||
      lowerSql.startsWith('pragma') ||
      lowerSql.startsWith('with') ||
      lowerSql.includes('returning')
    )
  }

  return false
}

/**
 * Prepared statements kept per connection. Kysely compiles a query to the same
 * SQL text every time its shape repeats (only the parameters change), so
 * re-preparing it on every call re-parses and re-plans the statement for
 * nothing. 128 covers the working set of a small service; the least recently
 * used entry is dropped beyond it.
 */
const STATEMENT_CACHE_SIZE = 128

/**
 * A single Kysely {@link DatabaseConnection} backed by a synchronous
 * `node:sqlite` handle.
 */
export class NodeSQLiteConnection implements DatabaseConnection {
  readonly #db: DatabaseSync
  /** Insertion order is recency order: a hit is re-inserted, the oldest key is evicted. */
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

    if (returnsRows(compiledQuery.query, sql)) {
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
    // `node:sqlite` is synchronous and has no cursor API; emulate streaming by
    // materialising the full result set and yielding it as one chunk.
    const result = await this.executeQuery<R>(compiledQuery)
    if (result.rows) yield { rows: result.rows }
  }
}
