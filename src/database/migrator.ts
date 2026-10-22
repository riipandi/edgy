import { Data } from 'effect'
import type { Kysely } from 'kysely'
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely/migration'
import { getMigrations } from './migrations/index.ts'
import type { DB } from './schema.ts'
import { seedUsers } from './seeders/user_factory.ts'

export class MigratorError extends Data.TaggedError('MigratorError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

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

export const migrateToLatest = (db: Kysely<DB>): Promise<MigrationResultSet> =>
  migrator(db).migrateToLatest()

export const migrateTo = (db: Kysely<DB>, target: string): Promise<MigrationResultSet> =>
  migrator(db).migrateTo(target)

export const migrateDownStep = (db: Kysely<DB>): Promise<MigrationResultSet> =>
  migrator(db).migrateDown()

export const migrateToNoMigrations = (db: Kysely<DB>): Promise<MigrationResultSet> =>
  migrator(db).migrateTo(NO_MIGRATIONS)

export const migrationStatus = (db: Kysely<DB>) => migrator(db).getMigrations()

export const migrateAndSeed = async (db: Kysely<DB>): Promise<MigrationResultSet> => {
  const result = await migrateToLatest(db)
  if (result.error === undefined) await seedUsers(db)
  return result
}
