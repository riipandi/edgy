import type { Migration } from 'kysely/migration'
import * as createUsersTable from './00000_create_users_table.ts'

/**
 * Static migration registry.
 *
 * Migrations are referenced through this module instead of being discovered
 * from disk at runtime. Two reasons:
 *
 * 1. `builder/` can inline every migration into the server bundle, so the
 *    build output stays a single file with no `migrations/` folder to ship.
 * 2. Bundlers can see the imports statically, so nothing gets tree-shaken away.
 *
 * Keys must sort in execution order (zero-padded numeric prefix, then name).
 */
export const migrations: Record<string, Migration> = {
  '00000_create_users_table': createUsersTable
}
