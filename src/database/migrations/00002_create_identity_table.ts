import type { Kysely } from 'kysely'
import { binaryType, currentTimestamp, modifyEndQuery } from '#/database/dialect-helpers.ts'
import type { DB } from '#/database/schema.ts'

export const up = async (db: Kysely<DB>): Promise<void> => {
  // ---------------------------------------------------------------------------
  // Table and indexes for: users
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('role', 'integer', (col) => col.notNull().defaultTo(10)) // SUBSCRIBER
    .addColumn('email_verified', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('data', 'text')
    .addColumn('disabled', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addColumn('updated_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema.createIndex('idx_users_email').on('users').column('email').ifNotExists().execute()
  await db.schema
    .createIndex('idx_users_disabled')
    .on('users')
    .column('disabled')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: passkey credentials
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('credentials')
    .addColumn('id', 'text', (col) => col.primaryKey()) // Base64url credential ID
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('public_key', binaryType(db), (col) => col.notNull()) // COSE public key
    .addColumn('counter', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('device_type', 'text', (col) => col.notNull()) // 'singleDevice' | 'multiDevice'
    .addColumn('backed_up', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('transports', 'text') // JSON array
    .addColumn('name', 'text') // User-friendly name
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addColumn('last_used_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addForeignKeyConstraint('credentials_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_credentials_user')
    .on('credentials')
    .column('user_id')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: auth tokens
  // Purpose: magic links, email verification, invites, recovery
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('auth_tokens')
    .addColumn('hash', 'text', (col) => col.primaryKey()) // SHA-256 hash of token
    .addColumn('user_id', 'text')
    .addColumn('email', 'text') // For pre-user tokens
    .addColumn('type', 'text', (col) => col.notNull()) // 'magic_link' | 'email_verify' | 'invite' | 'recovery'
    .addColumn('role', 'integer') // For invites
    .addColumn('invited_by', 'text')
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addForeignKeyConstraint('auth_tokens_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('auth_tokens_invited_by_fk', ['invited_by'], 'users', ['id'], (cb) =>
      cb.onDelete('set null')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_auth_tokens_email')
    .on('auth_tokens')
    .column('email')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: oauth accounts (external provider links)
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('oauth_accounts')
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_account_id', 'text', (col) => col.notNull())
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .addPrimaryKeyConstraint('oauth_accounts_pk', ['provider', 'provider_account_id'])
    .addForeignKeyConstraint('oauth_accounts_user_fk', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  await db.schema
    .createIndex('idx_oauth_accounts_user')
    .on('oauth_accounts')
    .column('user_id')
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: allowed domains for self-signup
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('allowed_domains')
    .addColumn('domain', 'text', (col) => col.primaryKey())
    .addColumn('default_role', 'integer', (col) => col.notNull().defaultTo(20)) // CONTRIBUTOR
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .ifNotExists()
    .execute()

  // ---------------------------------------------------------------------------
  // Table and indexes for: webauthn challenges (ephemeral, with TTL)
  // ---------------------------------------------------------------------------
  await db.schema
    .createTable('auth_challenges')
    .addColumn('challenge', 'text', (col) => col.primaryKey()) // Base64url challenge
    .addColumn('type', 'text', (col) => col.notNull()) // 'registration' | 'authentication'
    .addColumn('user_id', 'text') // For registration, the user being registered
    .addColumn('data', 'text') // JSON for additional context
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(currentTimestamp(db)))
    .modifyEnd(modifyEndQuery(db))
    .ifNotExists()
    .execute()

  // Index for efficient cleanup of expired challenges
  await db.schema
    .createIndex('idx_auth_challenges_expires')
    .on('auth_challenges')
    .column('expires_at')
    .ifNotExists()
    .execute()
}

export const down = async (db: Kysely<DB>): Promise<void> => {
  // Drop indexes first in reverse order
  await db.schema.dropIndex('idx_auth_challenges_expires').ifExists().execute()
  await db.schema.dropIndex('idx_oauth_accounts_user').ifExists().execute()
  await db.schema.dropIndex('idx_auth_tokens_email').ifExists().execute()
  await db.schema.dropIndex('idx_credentials_user').ifExists().execute()
  await db.schema.dropIndex('idx_users_disabled').ifExists().execute()
  await db.schema.dropIndex('idx_users_email').ifExists().execute()

  // Drop tables in reverse order
  await db.schema.dropTable('auth_challenges').ifExists().execute()
  await db.schema.dropTable('allowed_domains').ifExists().execute()
  await db.schema.dropTable('oauth_accounts').ifExists().execute()
  await db.schema.dropTable('auth_tokens').ifExists().execute()
  await db.schema.dropTable('credentials').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
}
