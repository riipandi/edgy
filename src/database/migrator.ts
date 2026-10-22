import type { Kysely } from 'kysely'
import { Migrator, type MigrationResultSet } from 'kysely/migration'
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

export const migrateToLatest = (db: Kysely<DB>): Promise<MigrationResultSet> => {
  return migrator(db).migrateToLatest()
}

export const migrationStatus = (db: Kysely<DB>) => migrator(db).getMigrations()

export const migrateAndSeed = async (db: Kysely<DB>): Promise<MigrationResultSet> => {
  const result = await migrateToLatest(db)
  if (result.error === undefined) await seedUsers(db)
  return result
}
