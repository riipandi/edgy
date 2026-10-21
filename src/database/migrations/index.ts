import type { Migration } from 'kysely/migration'
import * as createPlatform from './0001_create_platform_tables.ts'
import * as createIdentity from './0002_create_identity_table.ts'

type MigrationItems = Record<string, Migration>

const MIGRATIONS: Readonly<MigrationItems> = Object.freeze({
  '0001_create_platform_tables': createPlatform,
  '0002_create_identity_table': createIdentity
})

/** Ordered names from the statically registered migration set. */
export const MIGRATION_NAMES: readonly string[] = Object.freeze(Object.keys(MIGRATIONS))

/** Total number of registered migrations. Exported for use in tests. */
export const MIGRATION_COUNT = MIGRATION_NAMES.length

export const getMigrations = async (): Promise<MigrationItems> => MIGRATIONS
