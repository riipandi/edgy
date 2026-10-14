import { Effect } from 'effect'
import { FileMigrationProvider, Migrator } from 'kysely/migration'
import type { MigrationResult } from 'kysely/migration'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseError } from '../httputils/errors.ts'
import { DatabaseService } from './runtime.ts'

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url))

/**
 * Kysely migrator bound to the migrations folder. Migrations are discovered at
 * runtime from `*.ts` / `*.js` files, ordered by filename.
 */
const makeMigrator = (db: DatabaseService['Service']['db']): Migrator =>
  new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: { readdir: (dir) => fs.readdir(dir) },
      path: { join: (...segments) => path.join(...segments) },
      migrationFolder: MIGRATIONS_DIR
    })
  })

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
