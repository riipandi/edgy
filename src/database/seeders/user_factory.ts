import type { Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'
import { defineUserId, type User, type UserInsert } from '#/modules/identity/user/user_schema.ts'

const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19)

// Storage columns shared by every seeded row; the identity fields vary below.
const base = {
  avatar_url: null,
  email_verified: 0,
  data: null,
  disabled: 0,
  created_at: createdAt,
  updated_at: createdAt
}

// TODO: The password has no credential store yet, so it is accepted but
// unused — a no-op until the credential surface lands and this factory
// hashes it.
const seedUser = (user: User, password: string | null = null): UserInsert => {
  void password
  return { ...user }
}

const users: Array<UserInsert> = [
  seedUser({
    ...base,
    id: defineUserId('01890a5d-ac96-774b-bcce-b302099a8056').toString(),
    email: 'admin@example.com',
    name: 'Admin Sistem',
    role: 100
  }),
  seedUser({
    ...base,
    id: defineUserId('01890a5d-ac96-774b-bcce-b302099a8057').toString(),
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    role: 20
  }),
  seedUser({
    ...base,
    id: defineUserId('01890a5d-ac96-774b-bcce-b302099a8058').toString(),
    email: 'grace@example.com',
    name: 'Grace Hopper',
    role: 20
  }),
  seedUser({
    ...base,
    id: defineUserId('01890a5d-ac96-774b-bcce-b302099a8059').toString(),
    email: 'margaret@example.com',
    name: 'Margaret Hamilton',
    role: 20
  })
]

// The email conflict clause keeps re-running the seeder idempotent
// without a pre-SELECT roundtrip.
export const seedUsers = async (db: Kysely<DB>): Promise<void> => {
  await db
    .insertInto('users')
    .values(users)
    .onConflict((conflict) => conflict.column('email').doNothing())
    .execute()
}

/** Number of records inserted by the users seeder, for dry-run reports. */
export const USER_SEED_COUNT = users.length
