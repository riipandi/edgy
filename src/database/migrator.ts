import type { Kysely } from 'kysely'
import { Migrator, type MigrationResultSet } from 'kysely/migration'
import { getMigrations } from './migrations/index.ts'
import type { DB } from './schema.ts'
import { seedUsers } from './seeders/user_factory.ts'

const migratorFor = (db: Kysely<DB>) => new Migrator({ db, provider: { getMigrations } })

export const migrateToLatest = (db: Kysely<DB>): Promise<MigrationResultSet> => {
  return migratorFor(db).migrateToLatest()
}

export const migrationStatus = (db: Kysely<DB>) => migratorFor(db).getMigrations()

export const migrateAndSeed = async (db: Kysely<DB>): Promise<MigrationResultSet> => {
  const result = await migrateToLatest(db)
  if (result.error === undefined) await seedUsers(db)
  return result
}
