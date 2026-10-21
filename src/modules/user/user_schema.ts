import { Schema } from 'effect'
import { TypeID } from 'typeid-js'

export const UserIdParams = Schema.Struct({
  id: Schema.String
})

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatar_url: Schema.NullOr(Schema.String),
  role: Schema.Number, // 10 = SUBSCRIBER, 20 = CONTRIBUTOR
  email_verified: Schema.Number,
  data: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String
})

export type User = Schema.Schema.Type<typeof User>

export type UserView = Omit<User, 'id'>

export const parseUserId = (value: string): string => TypeID.fromString(value, 'user').toString()
