import type { Migration } from 'kysely/migration'
import * as createPlatform from './00001_create_platform_tables.ts'
import * as createIdentity from './00002_create_identity_table.ts'
import * as createToken from './00003_create_token_tables.ts'
import * as createRateLimit from './00004_rate_limits_table.ts'

type MigrationItems = Record<string, Migration>

const MIGRATIONS: Readonly<MigrationItems> = Object.freeze({
  '00001_create_platform_tables': createPlatform,
  '00002_create_identity_table': createIdentity,
  '00003_create_token_tables.ts': createToken,
  '00004_rate_limits_table.ts': createRateLimit
})

/** Ordered names from the statically registered migration set. */
export const MIGRATION_NAMES: readonly string[] = Object.freeze(Object.keys(MIGRATIONS))

/** Total number of registered migrations. Exported for use in tests. */
export const MIGRATION_COUNT = MIGRATION_NAMES.length

export const getMigrations = async (): Promise<MigrationItems> => MIGRATIONS
