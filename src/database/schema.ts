import type { ColumnType } from 'kysely'

export interface UserTable {
  id: ColumnType<string, string, never>
  name: string
  title: string
}

export interface User {
  id: string
  name: string
  title: string
}

export interface DB {
  users: UserTable
}
