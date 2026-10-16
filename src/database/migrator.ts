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
import type { DatabaseError } from '../kernel/errors.ts'
import { migrations } from './migrations/index.ts'
import { DatabaseService } from './service.ts'

/**
 * In-memory provider over the static registry. Migrations ship inside the bundle: no runtime
 * `readdir` and no migrations directory to deploy.
 */
const staticMigrationProvider: MigrationProvider = {
  getMigrations: (): Promise<Record<string, Migration>> => Promise.resolve(migrations)
}

/** Kysely migrator bound to the static migration registry. */
const makeMigrator = (db: DatabaseService['Service']['db']): Migrator =>
  new Migrator({ db, provider: staticMigrationProvider })

/**
 * Kysely migration methods never throw; they resolve with the error under `.error`. This moves the
 * error into the {@link DatabaseError} channel and unwraps `.results`.
 */
const runMigration = (
  execute: (migrator: Migrator) => Promise<MigrationResultSet>
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  DatabaseService.use(({ query }) =>
    query(async (db) => {
      const { error, results } = await execute(makeMigrator(db))
      if (error) throw error
      return results ?? []
    })
  )

/** Every registered migration with its state; `executedAt` is `undefined` while pending. */
export const getMigrationInfos: Effect.Effect<
  ReadonlyArray<MigrationInfo>,
  DatabaseError,
  DatabaseService
> = DatabaseService.use(({ query }) => query((db) => makeMigrator(db).getMigrations()))

/** Runs every migration that has not been applied yet. */
export const migrateToLatest: Effect.Effect<
  ReadonlyArray<MigrationResult>,
  DatabaseError,
  DatabaseService
> = runMigration((migrator) => migrator.migrateToLatest())

/** Migrates up or down to the named migration, or all the way down with `NO_MIGRATIONS`. */
export const migrateTo = (
  target: string | NoMigrations
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  runMigration((migrator) => migrator.migrateTo(target))

/**
 * Rolls back the given number of executed migrations. Kysely's `migrateDown` moves one step only,
 * so the target is resolved from the executed list and passed to `migrateTo`.
 */
export const migrateDown = (
  steps: number
): Effect.Effect<ReadonlyArray<MigrationResult>, DatabaseError, DatabaseService> =>
  Effect.gen(function* () {
    const infos = yield* getMigrationInfos
    const target = rollbackTarget(
      infos.filter((info) => info.executedAt !== undefined).map((info) => info.name),
      steps
    )
    return target === undefined ? [] : yield* migrateTo(target)
  })

/**
 * Target to stop at when rolling back `steps` of the `executed` migrations: the one before the last
 * `steps`, or `NO_MIGRATIONS` when they cover all. `undefined` when nothing is rolled back.
 */
export const rollbackTarget = (
  executed: ReadonlyArray<string>,
  steps: number
): string | NoMigrations | undefined => {
  if (executed.length === 0 || steps <= 0) return undefined
  if (executed.length <= steps) return NO_MIGRATIONS
  return executed[executed.length - steps - 1]
}
