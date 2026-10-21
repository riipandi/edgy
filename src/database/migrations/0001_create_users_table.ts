import type { Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('title', 'text', (column) => column.notNull())
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  await db.schema.dropTable('users').execute()
}
