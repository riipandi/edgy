import { sql, type Kysely } from 'kysely'
import { currentTimestamp } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('password_hash', 'text')
    .addColumn('name', 'text')
    .addColumn('title', 'text')
    .addColumn('role', 'text', (col) => col.defaultTo('subscriber'))
    .addColumn('avatar_id', 'text')
    .addColumn('data', 'text')
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .modifyEnd(sql`STRICT`)
    .ifNotExists()
    .execute()

  await db.schema.createIndex('idx_users_email').ifNotExists().on('users').column('email').execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  await db.schema.dropIndex('idx_users_email').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
}
