import { Effect } from 'effect'
import { Migrator } from 'kysely/migration'
import type { Migration, MigrationProvider, MigrationResult } from 'kysely/migration'
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

/** Runs every migration that has not been applied yet. */
export const migrateToLatest: Effect.Effect<
  ReadonlyArray<MigrationResult>,
  DatabaseError,
  DatabaseService
> = DatabaseService.use(({ db }) =>
  Effect.tryPromise({
    try: async () => {
      const { error, results } = await makeMigrator(db).migrateToLatest()
      if (error) throw error
      return results ?? []
    },
    catch: (cause) => new DatabaseError({ cause })
  })
)
