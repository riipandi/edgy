import type { Insertable, Kysely } from 'kysely'
import { TypeID } from 'typeid-js'
import type { DB } from '#/database/schema.ts'

const id = (uuid: string) => TypeID.fromUUID('user', uuid).toString()

const users: Insertable<DB['users']>[] = [
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8056'),
    email: 'admin@example.com',
    name: 'Admin Sistem',
    role: 100 // ADMIN
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8057'),
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    role: 20 // CONTRIBUTOR
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8058'),
    email: 'grace@example.com',
    name: 'Grace Hopper',
    role: 20 // CONTRIBUTOR
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8059'),
    email: 'margaret@example.com',
    name: 'Margaret Hamilton',
    role: 20 // CONTRIBUTOR
  }
]

export const seedUsers = async (db: Kysely<DB>): Promise<void> => {
  await db
    .insertInto('users')
    .values(users)
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute()
}

/** Number of records inserted by the users seeder, for dry-run reports. */
export const USER_SEED_COUNT = users.length
