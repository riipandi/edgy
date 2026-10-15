import type { Kysely } from 'kysely'
import type { Database } from '../schema.ts'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .ifNotExists()
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
