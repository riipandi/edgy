import type { Kysely } from 'kysely'
import { currentTimestamp, modifyEndQuery } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // Options (key-value store)
  await db.schema
    .createTable('options')
    .addColumn('name', 'text', (col) => col.primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // Audit logs (security events)
  await db.schema
    .createTable('audit_logs')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('timestamp', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addColumn('actor_id', 'text')
    .addColumn('actor_ip', 'text')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text')
    .addColumn('resource_id', 'text')
    .addColumn('details', 'text')
    .addColumn('status', 'text')
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_audit_actor')
    .on('audit_logs')
    .column('actor_id')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_audit_action')
    .on('audit_logs')
    .column('action')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_audit_timestamp')
    .on('audit_logs')
    .column('timestamp')
    .ifNotExists()
    .execute()

  // Media
  await db.schema
    .createTable('media')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('filename', 'text', (col) => col.notNull())
    .addColumn('mime_type', 'text', (col) => col.notNull())
    .addColumn('size', 'integer')
    .addColumn('width', 'integer')
    .addColumn('height', 'integer')
    .addColumn('alt', 'text')
    .addColumn('caption', 'text')
    .addColumn('storage_key', 'text', (col) => col.notNull())
    .addColumn('content_hash', 'text') // xxHash64 for deduplication
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('ready'))
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addColumn('author_id', 'text')
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_media_content_hash')
    .on('media')
    .column('content_hash')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_media_status')
    .on('media')
    .column('status')
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  // Drop indexes first in reverse order
  await db.schema.dropIndex('idx_media_status').ifExists().execute()
  await db.schema.dropIndex('idx_media_content_hash').ifExists().execute()
  await db.schema.dropIndex('idx_audit_timestamp').ifExists().execute()
  await db.schema.dropIndex('idx_audit_action').ifExists().execute()
  await db.schema.dropIndex('idx_audit_actor').ifExists().execute()

  // Drop tables in reverse order
  await db.schema.dropTable('media').ifExists().execute()
  await db.schema.dropTable('audit_logs').ifExists().execute()
  await db.schema.dropTable('options').ifExists().execute()
}
