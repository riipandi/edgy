import type { Insertable, Kysely } from 'kysely'
import { TypeID } from 'typeid-js'
import type { DB } from '#/database/schema.ts'

const id = (uuid: string) => TypeID.fromUUID('user', uuid).toString()

const users: Insertable<DB['users']>[] = [
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8057'),
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    title: 'First programmer'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8058'),
    email: 'grace@example.com',
    name: 'Grace Hopper',
    title: 'Compiler pioneer'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8059'),
    email: 'margaret@example.com',
    name: 'Margaret Hamilton',
    title: 'Software engineering'
  }
]

export const seedUsers = async (db: Kysely<DB>): Promise<void> => {
  await db
    .insertInto('users')
    .values(users)
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute()
}
