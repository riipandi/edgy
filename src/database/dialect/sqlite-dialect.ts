/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Adaptations for this project:
 * - The `node:sqlite` `DatabaseSync` handle is injected instead of being
 *   constructed from constructor args, because the Effect runtime owns the
 *   connection lifecycle (`database/service.ts`).
 * - Reuses Kysely's stock SQLite introspector and query compiler, and its adapter apart from the
 *   migration behaviour in `NodeSQLiteAdapter`; the driver is custom.
 */
import type { DatabaseIntrospector, Dialect, Driver } from 'kysely'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, sql } from 'kysely'
import type { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteDriver } from './sqlite-driver.ts'

/**
 * Kysely's stock SQLite adapter, with the two things it leaves out for migrations.
 *
 * - **Transactional DDL.** SQLite can roll back `CREATE TABLE` and friends; the stock adapter says
 *   it cannot, so a migration that fails halfway left what it had created behind and unrecorded.
 *   Now the migrator wraps the whole batch (and the record of it) in one transaction.
 * - **A migration lock.** Stock SQLite takes none, so two processes starting together
 *   (`serve --auto-migrate` twice) both applied the same migration and one died on the
 *   `kysely_migration` primary key. The lock is a write to the lock table inside that transaction:
 *   it takes SQLite's write lock (the second process waits, up to the busy timeout) and the second
 *   migrator then reads the state the first one left, finds nothing pending, and does nothing.
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
