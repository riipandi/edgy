import { TypeID } from 'typeid-js'

const id = (uuid: string) => TypeID.fromUUID('user', uuid).toString()

export type UserRecord = {
  id: string
  name: string
  title: string
}

/** The same fixed UUIDs the seeder uses. Unknown ids render the fallback copy. */
export const users = [
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
] as const satisfies readonly UserRecord[]

export const unknownUser = {
  id: 'user_00000000000000000000000000',
  name: 'Unknown',
  title: 'No such user'
} as const satisfies UserRecord
