import type { Migration } from 'kysely/migration'
import * as createUsers from './001_create_users.ts'

type MigrationItems = Record<string, Migration>

const migrations: MigrationItems = {
  '001_create_users': createUsers
}

export const getMigrations = async (): Promise<MigrationItems> => migrations
