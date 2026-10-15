import { Context, Effect, Layer } from 'effect'
import { Kysely, sql } from 'kysely'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ConfigService } from '../kernel/config.ts'
import { DatabaseError } from '../kernel/errors.ts'
import type { Database } from '../schemas/database.ts'
import { NodeSQLiteDialect } from './dialect/sqlite-dialect.ts'

/** SQLite extended result codes for `UNIQUE` and `PRIMARY KEY` violations. */
const UNIQUE_VIOLATION_CODES: ReadonlySet<unknown> = new Set([2067, 1555])

/**
 * Whether a `node:sqlite` failure is a uniqueness violation. Repositories use
 * it to turn the generic {@link DatabaseError} into a domain `Conflict`.
 */
export const isUniqueViolation = (error: DatabaseError): boolean =>
  typeof error.cause === 'object' &&
  error.cause !== null &&
  'errcode' in error.cause &&
  UNIQUE_VIOLATION_CODES.has(error.cause.errcode)

/** How long SQLite retries a locked database before failing with `SQLITE_BUSY`. */
const BUSY_TIMEOUT_MS = 5000

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
    /** Cheapest round trip to the database; used by the readiness probe. */
    readonly ping: Effect.Effect<void, DatabaseError>
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
            const sqlite = new DatabaseSync(databasePath, { timeout: BUSY_TIMEOUT_MS })
            // WAL lets `migrate:*` and the server share one file without readers
            // and the writer blocking each other. Not applicable to `:memory:`.
            if (databasePath !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL')
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

      const query: DatabaseService['Service']['query'] = (run) =>
        Effect.tryPromise({
          try: () => run(connection.db),
          catch: (cause) => new DatabaseError({ cause })
        })

      return DatabaseService.of({
        db: connection.db,
        query,
        ping: Effect.asVoid(query((db) => sql`select 1`.execute(db)))
      })
    })
  )
}
