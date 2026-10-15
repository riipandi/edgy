import { Context, Effect, Layer } from 'effect'
import { Kysely } from 'kysely'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ConfigService } from '../kernel/config.ts'
import { DatabaseError } from '../kernel/errors.ts'
import type { Database } from '../schemas/database.ts'
import { NodeSQLiteDialect } from './dialect/sqlite-dialect.ts'

/**
 * Database service. Repositories, the migrator and seeders depend on this key
 * instead of a raw `Kysely` instance, so the connection lifecycle stays owned
 * by the Effect scope.
 */
export class DatabaseService extends Context.Service<
  DatabaseService,
  {
    readonly db: Kysely<Database>
    /**
     * Runs a Kysely operation and maps any rejection to {@link DatabaseError}.
     * Every query goes through here, so the error channel is uniform and the
     * `tryPromise` boilerplate lives in one place.
     */
    readonly query: <A>(
      run: (db: Kysely<Database>) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>
  }
>()('DatabaseService') {
  /**
   * Opens the SQLite connection once per scope and destroys it on release.
   * Schema creation is owned by the migrator, not by this layer.
   *
   * Backed by Node's built-in `node:sqlite` (through {@link NodeSQLiteDialect}),
   * so no native module has to be compiled or shipped alongside the bundle.
   */
  static readonly layer: Layer.Layer<DatabaseService, DatabaseError, ConfigService> = Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const { databasePath } = yield* ConfigService

      const connection = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            mkdirSync(dirname(databasePath), { recursive: true })
            const sqlite = new DatabaseSync(databasePath)
            const db = new Kysely<Database>({ dialect: new NodeSQLiteDialect(sqlite) })
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

      return DatabaseService.of({
        db: connection.db,
        query: (run) =>
          Effect.tryPromise({
            try: () => run(connection.db),
            catch: (cause) => new DatabaseError({ cause })
          })
      })
    })
  )
}
