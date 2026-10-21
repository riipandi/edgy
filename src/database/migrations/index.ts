import type { Migration } from 'kysely/migration'
import * as createUsers from './001_create_users.ts'

type MigrationItems = Record<string, Migration>

const MIGRATIONS: Readonly<MigrationItems> = Object.freeze({
  '001_create_users': createUsers
})

/** Ordered names from the statically registered migration set. */
export const MIGRATION_NAMES: readonly string[] = Object.freeze(Object.keys(MIGRATIONS))

/** Total number of registered migrations. Exported for use in tests. */
export const MIGRATION_COUNT = MIGRATION_NAMES.length

export const getMigrations = async (): Promise<MigrationItems> => MIGRATIONS
