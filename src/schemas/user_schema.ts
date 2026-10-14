import type { Generated } from 'kysely'

/**
 * Row shape of the `users` table as stored in SQLite.
 */
export interface UsersTable {
  id: Generated<number>
  email: string
  name: string | null
}

/**
 * Plain JSON shape returned by the API (`id` is already materialised).
 */
export interface UserRow {
  id: number
  email: string
  name: string | null
}

declare module './database.ts' {
  interface Database {
    users: UsersTable
  }
}
