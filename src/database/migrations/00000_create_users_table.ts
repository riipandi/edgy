import { sql, type Kysely } from 'kysely'
import type { Database } from '../schema.ts'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .ifNotExists()
    .modifyEnd(sql`STRICT`)
    .execute()

  await db.schema
    .createIndex('users_name_id_idx')
    .on('users')
    .columns(['name', 'id'])
    .ifNotExists()
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
