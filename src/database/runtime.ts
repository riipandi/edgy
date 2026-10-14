import BetterSqlite3 from 'better-sqlite3'
import { Context, Effect, Layer } from 'effect'
import { Kysely, SqliteDialect } from 'kysely'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ConfigService } from '../config.ts'
import { DatabaseError } from '../httputils/errors.ts'
import type { Database } from '../schemas/database.ts'

/**
 * Database service. Handlers, services and seeders depend on this key instead
 * of a raw `Kysely` instance so the connection lifecycle stays managed by the
 * Effect runtime.
 */
export class DatabaseService extends Context.Service<
  DatabaseService,
  {
    readonly db: Kysely<Database>
  }
>()('DatabaseService') {}

/**
 * Opens the SQLite connection once per process and destroys it on scope close.
 * Schema creation is owned by the migrator, not by this layer.
 */
export const DatabaseLayer: Layer.Layer<DatabaseService, DatabaseError, ConfigService> =
  Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const { databaseFile } = yield* ConfigService

      return yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            mkdirSync(dirname(databaseFile), { recursive: true })
            const db = new Kysely<Database>({
              dialect: new SqliteDialect({
                database: new BetterSqlite3(databaseFile)
              })
            })
            return { db }
          },
          catch: (cause) => new DatabaseError({ cause })
        }),
        ({ db }) => Effect.promise(() => db.destroy())
      )
    })
  )
