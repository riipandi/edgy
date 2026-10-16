/**
 * Adapted from https://github.com/wolfie/kysely-node-native-sqlite (ISC, Copyright 2026 Henrik Paul).
 *
 * Differs from upstream: the `DatabaseSync` handle is injected because the Effect runtime owns the
 * connection. The introspector, compiler and adapter are Kysely's stock SQLite ones, except for the
 * migration behaviour of `NodeSQLiteAdapter`.
 */
import type { DatabaseIntrospector, Dialect, Driver } from 'kysely'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteDriver } from './sqlite-driver.ts'

/**
 * Kysely's stock SQLite adapter, except that SQLite can roll DDL back: the stock adapter says it
 * cannot. A migration that failed halfway would leave its tables behind unrecorded, so the migrator
 * wraps the batch and its record in one transaction.
 *
 * There is no migration lock. Kysely takes it on the connection before the transaction starts, so
 * it would not be held. The driver's `BEGIN IMMEDIATE` is the lock: a second process waits for the
 * write lock, then finds nothing pending.
 */
class NodeSQLiteAdapter extends SqliteAdapter {
  override get supportsTransactionalDdl(): boolean {
    return true
  }
}

/**
 * Kysely dialect for `node:sqlite`. Unlike the better-sqlite3 dialect it ships no native binary,
 * so the app bundles without `node_modules`.
 */
export class NodeSQLiteDialect implements Dialect {
  readonly #db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  createAdapter(): SqliteAdapter {
    return new NodeSQLiteAdapter()
  }

  createDriver(): Driver {
    return new NodeSQLiteDriver(this.#db)
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler()
  }
}
