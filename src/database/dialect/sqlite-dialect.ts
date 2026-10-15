/**
 * Adapted from https://github.com/wolfie/kysely-node-native-sqlite (ISC, Copyright 2026 Henrik Paul).
 *
 * Differs from upstream: the `DatabaseSync` handle is injected because the Effect runtime owns the
 * connection. The introspector, compiler and adapter are Kysely's stock SQLite ones, except for the
 * migration behaviour of `NodeSQLiteAdapter`.
 */
import type { DatabaseIntrospector, Dialect, Driver } from 'kysely'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, sql } from 'kysely'
import type { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteDriver } from './sqlite-driver.ts'

/**
 * Kysely's stock SQLite adapter with two migration changes.
 *
 * - Transactional DDL: SQLite can roll back DDL, but the stock adapter says it cannot. A migration
 *   that failed halfway would leave its tables behind unrecorded, so the migrator wraps the batch and
 *   its record in one transaction.
 * - Migration lock: stock SQLite takes none, so two processes starting together could apply the same
 *   migration and one would fail on the `kysely_migration` primary key. The lock is a write to the
 *   lock table inside that transaction. The second process waits on SQLite's write lock, then finds
 *   nothing pending.
 */
class NodeSQLiteAdapter extends SqliteAdapter {
  override get supportsTransactionalDdl(): boolean {
    return true
  }

  override async acquireMigrationLock(db: Kysely<unknown>): Promise<void> {
    await sql`update kysely_migration_lock set is_locked = is_locked where id = 'migration_lock'`.execute(
      db
    )
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
