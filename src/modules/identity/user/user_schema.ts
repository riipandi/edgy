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

// The API contract. `data`, `email_verified`, `disabled`, and `updated_at` are
// storage columns: the list endpoint would otherwise publish every internal
// field of every user, so the responses carry this projection instead.
export const UserResponse = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatar_url: Schema.NullOr(Schema.String),
  role: Schema.Number,
  created_at: Schema.String
}).annotate({ description: 'Public projection of a user record' })

const EmailSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMaxLength(254),
    Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'must be a valid email address' })
  )
).annotate({
  description: 'Email address; the same address in another spelling is a conflict.'
})

const NameSchema = Schema.NullOr(
  Schema.String.pipe(
    Schema.check(Schema.isMaxLength(200), Schema.isPattern(/\S/, { message: 'must not be blank' }))
  )
).annotate({ description: 'Display name; not blank, at most 200 characters' })

const AvatarUrlSchema = Schema.NullOr(
  Schema.String.pipe(
    Schema.check(
      Schema.isMaxLength(2048),
      Schema.isPattern(/^https?:\/\/\S+$/, { message: 'must be an absolute http(s) URL' })
    )
  )
).annotate({ description: 'Avatar image URL; absolute http(s) URL' })

// A write accepts only the public fields; role stays 10 (SUBSCRIBER) for
// created users and the storage columns are server-owned.
export const CreateUserRequest = Schema.Struct({
  email: EmailSchema,
  name: Schema.optional(NameSchema),
  avatar_url: Schema.optional(AvatarUrlSchema)
}).annotate({ description: 'Body of POST /users; absent optional fields default to null' })

// Absent fields stay unchanged; an explicit null clears the value.
export const UpdateUserRequest = Schema.Struct({
  email: Schema.optional(EmailSchema),
  name: Schema.optional(NameSchema),
  avatar_url: Schema.optional(AvatarUrlSchema)
}).annotate({ description: 'Body of PATCH /users/:id; absent fields stay unchanged' })

export const UserIdParams = Schema.Struct({
  id: Schema.String.check(
    Schema.isPattern(/^user_[0-9a-hjkmnp-tv-z]{26}$/),
    Schema.makeFilter((value: string) => {
      try {
        TypeID.fromString(value, 'user')
        return true
      } catch {
        return false
      }
    })
  )
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
export type UserResult = typeof UserResponse.Type

export const toUserResult = (user: User): UserResult => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar_url: user.avatar_url,
  role: user.role,
  created_at: user.created_at
})

declare module '#/database/schema.ts' {
  interface DB {
    users: IUser
  }
}
