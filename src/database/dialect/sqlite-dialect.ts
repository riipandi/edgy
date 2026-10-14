/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Adaptations for this project:
 * - The `node:sqlite` `DatabaseSync` handle is injected instead of being
 *   constructed from constructor args, because the Effect runtime owns the
 *   connection lifecycle (`database/runtime.ts`).
 * - Reuses Kysely's stock SQLite adapter, introspector and query compiler; only
 *   the driver is custom.
 */
import type { DatabaseIntrospector, Dialect, Driver } from 'kysely'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteDriver } from './sqlite-driver.ts'

/**
 * Kysely dialect for Node.js' built-in SQLite module (`node:sqlite`).
 *
 * Unlike the `better-sqlite3` dialect this ships no native binary, which makes
 * the app fully bundleable without `node_modules`.
 */
export class NodeSQLiteDialect implements Dialect {
  readonly #db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter()
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
