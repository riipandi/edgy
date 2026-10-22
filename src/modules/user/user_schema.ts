import { Schema } from 'effect'
import type { Insertable, Selectable, Updateable } from 'kysely'
import { TypeID, typeid } from 'typeid-js'

export type UserIdType = TypeID<'user'>

export const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatar_url: Schema.NullOr(Schema.String),
  role: Schema.Number, // 10 = SUBSCRIBER, 20 = CONTRIBUTOR
  email_verified: Schema.Number,
  data: Schema.NullOr(Schema.String),
  disabled: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String
})

export const UserIdParams = Schema.Struct({
  id: Schema.String
})

export function generateUserId(uuid?: string): UserIdType {
  return uuid ? TypeID.fromUUID('user', uuid) : typeid('user')
}

export function parseUserId(value: string): UserIdType {
  return TypeID.fromString(value, 'user')
}

// Table interface for Kysely
export type IUser = typeof UserSchema.Type

// Kysely types for operations
export type User = Selectable<IUser>
export type UserInsert = Insertable<IUser>
export type UserUpdate = Updateable<IUser>

declare module '#/database/schema.ts' {
  interface DB {
    users: IUser
  }
}
