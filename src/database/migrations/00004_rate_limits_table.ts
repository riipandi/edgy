import type { Kysely } from 'kysely'
import { modifyEndQuery } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // ---------------------------------------------------------------------------
  // Table and indexes for: rate limit + device code polling tracking
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('rate_limits')
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('window', 'text', (col) => col.notNull())
    .addColumn('count', 'integer', (col) => col.notNull().defaultTo(1))
    .addPrimaryKeyConstraint('pk_rate_limits', ['key', 'window'])
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // Index on window for efficient cleanup of expired entries
  await db.schema
    .createIndex('idx_rate_limits_window')
    .on('rate_limits')
    .column('window')
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  // Drop indexes first in reverse order
  await db.schema.dropIndex('idx_rate_limits_window').ifExists().execute()

  // Drop tables in reverse order
  await db.schema.dropTable('rate_limits').ifExists().execute()
}
