import { TypeID } from 'typeid-js'

const id = (uuid: string) => TypeID.fromUUID('user', uuid).toString()

export type UserRecord = {
  id: string
  name: string
  email: string
}

/** The same fixed UUIDs the seeder uses, admin first. Unknown ids render the fallback copy. */
export const users = [
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8056'),
    name: 'Admin Sistem',
    email: 'admin@example.com'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8057'),
    name: 'Ada Lovelace',
    email: 'ada@example.com'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8058'),
    name: 'Grace Hopper',
    email: 'grace@example.com'
  },
  {
    id: id('01890a5d-ac96-774b-bcce-b302099a8059'),
    name: 'Margaret Hamilton',
    email: 'margaret@example.com'
  }
] as const satisfies readonly UserRecord[]

export const unknownUser = {
  id: 'user_00000000000000000000000000',
  name: 'Unknown',
  email: ''
} as const satisfies UserRecord
