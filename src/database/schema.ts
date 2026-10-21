import type { ColumnType } from 'kysely'

export interface UserTable {
  id: ColumnType<string, string, never>
  email: string
  name: string | null
  avatar_url: string | null
  role: ColumnType<number, number | undefined, number | undefined> // 10 = SUBSCRIBER, 20 = CONTRIBUTOR
  email_verified: ColumnType<number, number | undefined, number | undefined>
  data: string | null
  created_at: ColumnType<string, string | undefined, never>
  updated_at: ColumnType<string, string | undefined, string | undefined>
}

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: number
  email_verified: number
  data: string | null
  created_at: string
  updated_at: string
}

export interface CredentialTable {
  id: ColumnType<string, string, never> // Base64url credential ID
  user_id: string
  public_key: Uint8Array // COSE public key
  counter: ColumnType<number, number | undefined, number | undefined>
  device_type: string // 'singleDevice' | 'multiDevice'
  backed_up: ColumnType<number, number | undefined, number | undefined>
  transports: string | null // JSON array
  name: string | null // User-friendly name
  created_at: ColumnType<string, string | undefined, never>
  last_used_at: ColumnType<string, string | undefined, string | undefined>
}

export interface AuthTokenTable {
  hash: ColumnType<string, string, never> // SHA-256 hash of token
  user_id: string | null
  email: string | null // For pre-user tokens
  type: string // 'magic_link' | 'email_verify' | 'invite' | 'recovery'
  role: number | null // For invites
  invited_by: string | null
  expires_at: string
  created_at: ColumnType<string, string | undefined, never>
}

export interface OAuthAccountTable {
  provider: string
  provider_account_id: string
  user_id: string
  created_at: ColumnType<string, string | undefined, never>
}

export interface AllowedDomainTable {
  domain: ColumnType<string, string, never>
  default_role: ColumnType<number, number | undefined, number | undefined>
  enabled: ColumnType<number, number | undefined, number | undefined>
  created_at: ColumnType<string, string | undefined, never>
}

export interface AuthChallengeTable {
  challenge: ColumnType<string, string, never> // Base64url challenge
  type: string // 'registration' | 'authentication'
  user_id: string | null // For registration, the user being registered
  data: string | null // JSON for additional context
  expires_at: string
  created_at: ColumnType<string, string | undefined, never>
}

export interface DB {
  users: UserTable
  credentials: CredentialTable
  auth_tokens: AuthTokenTable
  oauth_accounts: OAuthAccountTable
  allowed_domains: AllowedDomainTable
  auth_challenges: AuthChallengeTable
}
