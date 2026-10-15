import type { Migration } from 'kysely/migration'
import * as createUsersTable from './00000_create_users_table.ts'

/**
 * Static migration registry. Migrations are imported rather than read from disk,
 * so the server bundle stays one file and bundlers keep the imports.
 *
 * Keys must sort in execution order: a zero-padded numeric prefix, then the name.
 */
export const migrations: Record<string, Migration> = {
  '00000_create_users_table': createUsersTable
}
