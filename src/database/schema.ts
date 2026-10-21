import type { ColumnType } from 'kysely'

export interface UserTable {
  id: ColumnType<string, string, never>
  email: string
  password_hash: ColumnType<string, string | undefined, string | undefined>
  name: string | null
  title: string | null
  role: ColumnType<string, string | undefined, string | undefined>
  avatar_id: string | null
  data: string | null
  created_at: ColumnType<string, string | undefined, never>
}

export interface User {
  id: string
  email: string
  password_hash?: string
  name: string | null
  title: string | null
  role: string
  avatar_id: string | null
  data: string | null
  created_at: string
}

export interface DB {
  users: UserTable
}
