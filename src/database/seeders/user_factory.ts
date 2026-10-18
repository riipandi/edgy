import type { Kysely } from 'kysely'
import { TypeID } from 'typeid-js'
import type { DB } from '../schema.ts'

const id = (uuid: string) => TypeID.fromUUID('user', uuid).toString()

const users = [
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8057'),
    name: 'Ada Lovelace',
    title: 'First programmer'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8058'),
    name: 'Grace Hopper',
    title: 'Compiler pioneer'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8059'),
    name: 'Margaret Hamilton',
    title: 'Software engineering'
  }
] as const

export const seedUsers = async (db: Kysely<DB>): Promise<void> => {
  await db
    .insertInto('users')
    .values(users.map((user) => ({ ...user })))
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute()
}
