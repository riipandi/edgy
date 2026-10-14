import { Context, Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ConfigService } from '../config.ts'
import { DatabaseError } from '../httputils/errors.ts'
import type { Database } from '../schemas/database.ts'
import { NodeSQLiteDialect } from './dialect/sqlite-dialect.ts'

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
 *
 * Backed by Node's built-in `node:sqlite` module (through the local
 * {@link NodeSQLiteDialect}), so no native module has to be compiled or
 * shipped alongside the bundle.
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
            const sqlite = new DatabaseSync(databaseFile)
            const db = new Kysely<Database>({
              dialect: new NodeSQLiteDialect(sqlite)
            })
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
    })
  )
