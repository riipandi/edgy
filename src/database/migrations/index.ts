import type { Migration } from 'kysely/migration'
import * as createUsers from './0001_create_users_table.ts'

type MigrationItems = Record<string, Migration>

const MIGRATIONS: Readonly<MigrationItems> = Object.freeze({
  '0001_create_users_table': createUsers
})

/** Ordered names from the statically registered migration set. */
export const MIGRATION_NAMES: readonly string[] = Object.freeze(Object.keys(MIGRATIONS))

/** Total number of registered migrations. Exported for use in tests. */
export const MIGRATION_COUNT = MIGRATION_NAMES.length

export const getMigrations = async (): Promise<MigrationItems> => MIGRATIONS
