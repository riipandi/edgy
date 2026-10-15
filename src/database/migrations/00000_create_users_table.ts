import type { Kysely } from 'kysely'
import type { Database } from '../schema.ts'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('users')
    // A `user_` TypeID, minted by the application: text sorts in creation order (UUIDv7),
    // and the same column works on SQLite and D1 with no sequence to coordinate.
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .ifNotExists()
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
