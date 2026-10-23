import type { Kysely } from 'kysely'
import { currentTimestamp, modifyEndQuery } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // ---------------------------------------------------------------------------
  // Table and indexes for: app settings (key-value store)
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('app_settings')
    .addColumn('name', 'text', (col) => col.primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: audit logs (security events)
  // ---------------------------------------------------------------------------
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
  await db.schema
    .createIndex('idx_audit_resource')
    .on('audit_logs')
    .columns(['resource_type', 'resource_id'])
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: media folder
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('media_folders')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('name_key', 'text', (col) => col.notNull().unique())
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: media stores
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('media')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('folder_id', 'text', (col) =>
      col.references('media_folders.id').onDelete('set null')
    )
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
    .addColumn('focal_x', 'real')
    .addColumn('focal_y', 'real')
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
  await db.schema
    .createIndex('idx_media_mime_type')
    .on('media')
    .column('mime_type')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_media_filename')
    .on('media')
    .column('filename')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_media_created_at')
    .on('media')
    .column('created_at')
    .ifNotExists()
    .execute()
  await db.schema
    .createIndex('idx_media_folder_id')
    .on('media')
    .column('folder_id')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: media upload attempts
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('media_upload_attempts')
    .addColumn('storage_key', 'text', (col) => col.primaryKey())
    .addColumn('media_id', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(currentTimestamp(db)))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(currentTimestamp(db)))
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_media_upload_attempts_media_id')
    .on('media_upload_attempts')
    .column('media_id')
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_media_upload_attempts_status_created_at')
    .on('media_upload_attempts')
    .columns(['status', 'created_at'])
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_media_storage_key')
    .on('media')
    .column('storage_key')
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  // Drop indexes first in reverse order
  await db.schema.dropIndex('idx_media_storage_key').ifExists().execute()
  await db.schema.dropIndex('idx_media_upload_attempts_status_created_at').ifExists().execute()
  await db.schema.dropIndex('idx_media_upload_attempts_media_id').ifExists().execute()
  await db.schema.dropIndex('idx_media_folder_id').ifExists().execute()
  await db.schema.dropIndex('idx_media_created_at').ifExists().execute()
  await db.schema.dropIndex('idx_media_filename').ifExists().execute()
  await db.schema.dropIndex('idx_media_mime_type').ifExists().execute()
  await db.schema.dropIndex('idx_media_status').ifExists().execute()
  await db.schema.dropIndex('idx_media_content_hash').ifExists().execute()
  await db.schema.dropIndex('idx_audit_resource').ifExists().execute()
  await db.schema.dropIndex('idx_audit_timestamp').ifExists().execute()
  await db.schema.dropIndex('idx_audit_action').ifExists().execute()
  await db.schema.dropIndex('idx_audit_actor').ifExists().execute()

  // Drop tables in reverse order
  await db.schema.dropTable('media_upload_attempts').ifExists().execute()
  await db.schema.dropTable('media').ifExists().execute()
  await db.schema.dropTable('media_folders').ifExists().execute()
  await db.schema.dropTable('audit_logs').ifExists().execute()
  await db.schema.dropTable('app_settings').ifExists().execute()
}
