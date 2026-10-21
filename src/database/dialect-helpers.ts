/**
 * Default timestamp expression for column defaults.
 * Wrapped in parens for use in CREATE TABLE ... DEFAULT (...).
 *
 * sqlite:   (datetime('now'))
 * postgres: CURRENT_TIMESTAMP
 */

import { PostgresAdapter, sql, type Kysely, type RawBuilder } from 'kysely'
import type { DatabaseDialectType } from './adapter'
import type { DB } from './schema'

/**
 * Detect dialect type from a Kysely instance via the adapter class.
 */
export function detectDialect(db: Kysely<DB>): DatabaseDialectType {
  if (db.getExecutor().adapter instanceof PostgresAdapter) return 'postgres'
  return 'sqlite'
}

export function isSqlite(db: Kysely<DB>): boolean {
  return detectDialect(db) === 'sqlite'
}

export function isPostgres(db: Kysely<DB>): boolean {
  return detectDialect(db) === 'postgres'
}

/**
 * Default timestamp expression for column defaults.
 * Wrapped in parens for use in CREATE TABLE ... DEFAULT (...).
 *
 * sqlite:   (datetime('now'))
 * postgres: CURRENT_TIMESTAMP
 */
export function currentTimestamp(db: Kysely<DB>): RawBuilder<string> {
  if (isPostgres(db)) {
    return sql`CURRENT_TIMESTAMP`
  }
  return sql`(datetime('now'))`
}

export function modifyEndQuery(db: Kysely<DB>): RawBuilder<string> {
  if (isPostgres(db)) {
    return sql`USING heap`
  }
  return sql`STRICT`
}
