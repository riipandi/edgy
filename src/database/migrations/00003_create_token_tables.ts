import type { Kysely } from 'kysely'
import { currentTimestamp, modifyEndQuery } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // ---------------------------------------------------------------------------
  // Table and indexes for: personal access tokens
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('api_tokens')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('prefix', 'text', (col) => col.notNull())
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('scopes', 'text', (col) => col.notNull()) // JSON array
    .addColumn('expires_at', 'text') // null = no expiry
    .addColumn('last_used_at', 'text')
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addForeignKeyConstraint('api_tokens_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_api_tokens_token_hash')
    .on('api_tokens')
    .column('token_hash')
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_api_tokens_user_id')
    .on('api_tokens')
    .column('user_id')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: oauth access/refresh tokens
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('oauth_tokens')
    .addColumn('token_hash', 'text', (col) => col.primaryKey())
    .addColumn('token_type', 'text', (col) => col.notNull()) // 'access' | 'refresh'
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('scopes', 'text', (col) => col.notNull()) // JSON array
    .addColumn('client_type', 'text', (col) => col.notNull().defaultTo('cli'))
    .addColumn('client_id', 'text')
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('refresh_token_hash', 'text') // links access → refresh
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addForeignKeyConstraint('oauth_tokens_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_oauth_tokens_user_id')
    .on('oauth_tokens')
    .column('user_id')
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_oauth_tokens_expires')
    .on('oauth_tokens')
    .column('expires_at')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: device codes (OAuth Device Flow, RFC 8628)
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('device_codes')
    .addColumn('device_code', 'text', (col) => col.primaryKey())
    .addColumn('user_code', 'text', (col) => col.notNull().unique())
    .addColumn('scopes', 'text', (col) => col.notNull()) // JSON array
    .addColumn('user_id', 'text') // set when user authorizes
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('interval', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addColumn('last_polled_at', 'text')
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: authz codes for OAuth 2.1 authz code + PKCE flow.
  // Purpose: Used by MCP clients to authenticate via the standard OAuth
  // authorization code grant. Also adds client_id tracking to oauth_tokens
  // for per-client revocation.
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('authorization_codes')
    .addColumn('code_hash', 'text', (col) => col.primaryKey()) // SHA-256 hash of authorization code
    .addColumn('client_id', 'text', (col) => col.notNull()) // CIMD URL or opaque string
    .addColumn('redirect_uri', 'text', (col) => col.notNull()) // Must match exactly on exchange
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('scopes', 'text', (col) => col.notNull()) // JSON array
    .addColumn('code_challenge', 'text', (col) => col.notNull()) // S256 challenge
    .addColumn('code_challenge_method', 'text', (col) => col.notNull().defaultTo('S256'))
    .addColumn('resource', 'text') // RFC 8707 resource indicator
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addForeignKeyConstraint('auth_codes_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_auth_codes_expires')
    .on('authorization_codes')
    .column('expires_at')
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  // Drop indexes first in reverse order
  await db.schema.dropIndex('idx_auth_codes_expires').ifExists().execute()
  await db.schema.dropIndex('idx_oauth_tokens_expires').ifExists().execute()
  await db.schema.dropIndex('idx_oauth_tokens_user_id').ifExists().execute()
  await db.schema.dropIndex('idx_api_tokens_user_id').ifExists().execute()
  await db.schema.dropIndex('idx_api_tokens_token_hash').ifExists().execute()

  // Drop tables in reverse order
  await db.schema.dropTable('authorization_codes').ifExists().execute()
  await db.schema.dropTable('device_codes').ifExists().execute()
  await db.schema.dropTable('oauth_tokens').ifExists().execute()
  await db.schema.dropTable('api_tokens').ifExists().execute()
}
