import { Schema } from 'effect'
import { TypeID } from 'typeid-js'

export const UserIdParams = Schema.Struct({
  id: Schema.String
})

export const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  title: Schema.String
})

export type User = Schema.Schema.Type<typeof User>

export type UserView = Omit<User, 'id'>

export const parseUserId = (value: string): string => TypeID.fromString(value, 'user').toString()
