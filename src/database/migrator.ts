import { Effect } from 'effect'
import type { NoMigrations } from 'kysely/migration'
import { Migrator, NO_MIGRATIONS } from 'kysely/migration'
import type {
  Migration,
  MigrationInfo,
  MigrationProvider,
  MigrationResult,
  MigrationResultSet
} from 'kysely/migration'
import { DatabaseError } from '../httputils/errors.ts'
import { migrations } from './migrations/index.ts'
import { DatabaseService } from './runtime.ts'

/**
 * Migration provider backed by the static registry in `./migrations/index.ts`.
 *
 * Using an in-memory provider instead of `FileMigrationProvider` keeps the
 * migrations inside the bundle: there is no runtime `readdir` and no
 * `migrations/` directory to deploy alongside the server.
 */
const staticMigrationProvider: MigrationProvider = {
  getMigrations: (): Promise<Record<string, Migration>> => Promise.resolve(migrations)
}

/** Kysely migrator bound to the static migration registry. */
const makeMigrator = (db: DatabaseService['Service']['db']): Migrator =>
  new Migrator({ db, provider: staticMigrationProvider })

/**
 * Runs a migrator operation and normalises the result.
 *
 * Kysely migration methods never throw — they resolve to a
 * {@link MigrationResultSet} with the error under `.error`. This wrapper
 * converts that shape into Effect's typed error channel
 * ({@link DatabaseError}) and unwraps `.results`.
 */
const runMigration = (
  execute: (migrator: Migrator) => Promise<MigrationResultSet>
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  DatabaseService.use(({ db }) =>
    Effect.tryPromise({
      try: async () => {
        const { error, results } = await execute(makeMigrator(db))
        if (error) throw error
        return results ?? []
      },
      catch: (cause) => new DatabaseError({ cause })
    })
  )

/**
 * Lists every registered migration together with its execution state
 * (`.executedAt` is `undefined` for pending migrations). Sorted by name.
 */
export const getMigrationInfos: Effect.Effect<
  ReadonlyArray<MigrationInfo>,
  DatabaseError,
  DatabaseService
> = DatabaseService.use(({ db }) =>
  Effect.tryPromise({
    try: () => makeMigrator(db).getMigrations(),
    catch: (cause) => new DatabaseError({ cause })
  })
)

/** Runs every migration that has not been applied yet. */
export const migrateToLatest: Effect.Effect<
  ReadonlyArray<MigrationResult>,
  DatabaseError,
  DatabaseService
> = runMigration((migrator) => migrator.migrateToLatest())

/**
 * Migrates up or down to a specific migration by name, or all the way down
 * with `NO_MIGRATIONS`.
 */
export const migrateTo = (
  target: string | NoMigrations
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  runMigration((migrator) => migrator.migrateTo(target))

/**
 * Rolls back the given number of executed migrations.
 *
 * Kysely's `migrateDown` only moves one step, so the target name is resolved
 * from the executed-migration list and delegated to `migrateTo`, which rolls
 * back every migration after (but not including) the target.
 */
export const migrateDown = (
  steps: number
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  Effect.gen(function* () {
    const infos = yield* getMigrationInfos
    const executed = infos.filter((info) => info.executedAt !== undefined)
    if (executed.length === 0 || steps <= 0) return []
    if (executed.length <= steps) return yield* migrateTo(NO_MIGRATIONS)
    const target = executed[executed.length - steps]
    return yield* migrateTo(target!.name)
  })
