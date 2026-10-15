import { Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ConfigService } from '../kernel/config/service.ts'
import { DatabaseError } from '../kernel/errors.ts'
import { NodeSQLiteDialect } from './dialect/sqlite-dialect.ts'
import type { Database } from './schema.ts'
import { DatabaseService, makeDatabaseService, makeQueryLogger } from './service.ts'

/** How long SQLite retries a locked database before failing with `SQLITE_BUSY`. */
const BUSY_TIMEOUT_MS = 5000

/**
 * `DATABASE_DRIVER=sqlite`. Opens the connection once per scope and closes it on release. Schema
 * changes belong to the migrator. Backed by `node:sqlite`, so no native module ships with the bundle.
 * Node-only: the Workers entry must not import this module.
 */
export const SqliteDatabaseLayer: Layer.Layer<DatabaseService, DatabaseError, ConfigService> =
  Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const { database } = yield* ConfigService
      const databasePath = database.path
      const log = yield* makeQueryLogger

      const connection = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            mkdirSync(dirname(databasePath), { recursive: true })
            const sqlite = new DatabaseSync(databasePath, { timeout: BUSY_TIMEOUT_MS })
            // WAL lets the migrator and the server share one file without blocking each other.
            if (databasePath !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL')
            const db = new Kysely<Database>({ dialect: new NodeSQLiteDialect(sqlite), log })
            return { db, sqlite }
          },
          catch: (cause) => new DatabaseError({ cause })
        }),
        ({ db, sqlite }) =>
          Effect.promise(async () => {
            await db.destroy()
            sqlite.close()
          })
      )

      return makeDatabaseService(connection.db, {
        transactions: true,
        singleConnection: true,
        retryReads: false
      })
    })
  )
