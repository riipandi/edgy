import { sql, type Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // ---------------------------------------------------------------------------
  // Table for: rate limit token-bucket state + device code polling tracking
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('rate_limits')
    .addColumn('key', 'text', (col) => col.notNull().primaryKey())
    .addColumn('tokens', 'integer', (col) => col.notNull())
    .addColumn('last_refill', 'integer', (col) => col.notNull())
    .modifyEnd(sql`STRICT`)
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  await db.schema.dropTable('rate_limits').ifExists().execute()
}
