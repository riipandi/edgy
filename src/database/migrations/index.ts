import type { Migration } from 'kysely/migration'
import * as m00001 from './00001_create_platform_tables.ts'
import * as m00002 from './00002_create_identity_table.ts'
import * as m00003 from './00003_create_token_tables.ts'
import * as m00004 from './00004_rate_limits_table.ts'

type MigrationItems = Record<string, Migration>

const MIGRATIONS: Readonly<MigrationItems> = Object.freeze({
  '00001_create_platform_tables': m00001,
  '00002_create_identity_table': m00002,
  '00003_create_token_tables': m00003,
  '00004_rate_limits_table': m00004
})

/** Ordered names from the statically registered migration set. */
export const MIGRATION_NAMES: readonly string[] = Object.freeze(Object.keys(MIGRATIONS))

/** Total number of registered migrations. Exported for use in tests. */
export const MIGRATION_COUNT = MIGRATION_NAMES.length

export const getMigrations = async (): Promise<MigrationItems> => MIGRATIONS
