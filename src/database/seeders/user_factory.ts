import type { Kysely } from 'kysely'
import type { DB } from '#/database/schema.ts'
import { generateUserId, type UserInsert } from '#/modules/identity/user/user_schema.ts'

const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
const seedUser = (id: string, email: string, name: string, role: number): UserInsert => ({
  id,
  email,
  name,
  avatar_url: null,
  role,
  email_verified: 0,
  data: null,
  disabled: 0,
  created_at: createdAt,
  updated_at: createdAt
})

const users = [
  seedUser(
    generateUserId('01890a5d-ac96-774b-bcce-b302099a8056').toString(),
    'admin@example.com',
    'Admin Sistem',
    100
  ),
  seedUser(
    generateUserId('01890a5d-ac96-774b-bcce-b302099a8057').toString(),
    'ada@example.com',
    'Ada Lovelace',
    20
  ),
  seedUser(
    generateUserId('01890a5d-ac96-774b-bcce-b302099a8058').toString(),
    'grace@example.com',
    'Grace Hopper',
    20
  ),
  seedUser(
    generateUserId('01890a5d-ac96-774b-bcce-b302099a8059').toString(),
    'margaret@example.com',
    'Margaret Hamilton',
    20
  )
]

export const seedUsers = async (db: Kysely<DB>): Promise<void> => {
  const existing = new Set(
    (await db.selectFrom('users').select('email').execute()).map((row) => row.email)
  )
  const pending = users.filter((user) => !existing.has(user.email))
  if (pending.length === 0) return
  await db
    .insertInto('users')
    .values(pending)
    .onConflict((conflict) => conflict.column('email').doNothing())
    .execute()
}

/** Number of records inserted by the users seeder, for dry-run reports. */
export const USER_SEED_COUNT = users.length
