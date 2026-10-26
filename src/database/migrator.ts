import { Effect } from 'effect'
import type { Kysely } from 'kysely'
import { Migrator, NO_MIGRATIONS } from 'kysely/migration'
import type { MigrationInfo, NoMigrations } from 'kysely/migration'
import type { MigrationResult, MigrationResultSet } from 'kysely/migration'
import { Database, type DatabaseError } from './adapter.ts'
import { getMigrations } from './migrations/index.ts'
import type { DB } from './schema.ts'
import { seedUsers } from './seeders/user_factory.ts'

function migrator(db: Kysely<DB>) {
  return new Migrator({
    db,
    migrationTableName: 'app_migration',
    migrationLockTableName: 'app_migration_lock',
    allowUnorderedMigrations: false,
    disableTransactions: false,
    provider: { getMigrations }
  })
}

/**
 * Kysely migration methods never throw; they resolve with the error under
 * `.error`. This moves the error into the {@link DatabaseError} channel and
 * unwraps `.results`.
 */
const runMigration = (execute: (migrator: Migrator) => Promise<MigrationResultSet>) =>
  Database.use(({ query }) =>
    query(async (db) => {
      const { error, results } = await execute(migrator(db))
      if (error) throw error
      return results ?? []
    })
  )

/** Every registered migration with its state; `executedAt` is undefined while pending. */
export const migrationStatus: Effect.Effect<
  ReadonlyArray<MigrationInfo>,
  DatabaseError,
  Database
> = Database.use(({ query }) => query((db) => migrator(db).getMigrations()))

/** Runs every migration that has not been applied yet. */
export const migrateToLatest: Effect.Effect<
  ReadonlyArray<MigrationResult>,
  DatabaseError,
  Database
> = runMigration((migrator) => migrator.migrateToLatest())

/** Migrates up or down to the named migration, or all the way down with `NO_MIGRATIONS`. */
export const migrateTo = (
  target: string | NoMigrations
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, Database> =>
  runMigration((migrator) => migrator.migrateTo(target))

/** Rolls the schema all the way down. */
export const migrateToNoMigrations = migrateTo(NO_MIGRATIONS)

/**
 * Rolls back `steps` of the `executed` migrations — the caller already read the
 * status, so this never queries it again. `NO_MIGRATIONS` when the steps cover
 * every migration.
 */
export const migrateDown = (
  executed: ReadonlyArray<string>,
  steps: number
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, Database> =>
  Effect.gen(function* () {
    if (executed.length === 0 || steps <= 0) return []
    const target =
      executed.length <= steps ? NO_MIGRATIONS : (executed[executed.length - steps - 1] as string)
    return yield* migrateTo(target)
  })

/** Runs pending migrations, then the seeders. */
export const migrateAndSeed: Effect.Effect<
  ReadonlyArray<MigrationResult>,
  DatabaseError,
  Database
> = Effect.gen(function* () {
  const results = yield* migrateToLatest
  yield* Database.use(({ query }) => query((db) => seedUsers(db)))
  return results
})
