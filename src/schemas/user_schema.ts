import { Schema } from 'effect'
import type { Generated } from 'kysely'

/**
 * `User` is the single source of truth for the resource: the request, response
 * and Kysely table types below are all derived from it, so a new column is
 * declared once.
 */
export const User = Schema.Struct({
  id: Schema.Int,
  email: Schema.String.pipe(
    Schema.check(
      Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'must be a valid email address' })
    )
  ),
  name: Schema.NullOr(Schema.String)
})

export type User = typeof User.Type

// --- Requests ---

/** JSON body accepted by `POST /users`; `name` may be omitted. */
export const UserCreateRequest = Schema.Struct({
  email: User.fields.email,
  name: Schema.optional(Schema.String)
})

export type UserCreateRequest = typeof UserCreateRequest.Type

/** Router params arrive as strings: decode `:id` into a positive integer. */
export const UserIdParams = Schema.Struct({
  id: Schema.NumberFromString.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
})

// --- Responses ---

/**
 * Response bodies are encoded through these schemas, so only the declared
 * fields ever reach the client — a column added to the table later does not
 * leak through `selectAll()`.
 */
export const UserGetResponse = User
export const UserListResponse = Schema.Array(User)
export const UserCreateResponse = User

// --- Kysely ---

/** Row shape of the `users` table: `User` with a database-generated `id`. */
export interface UsersTable extends Omit<User, 'id'> {
  id: Generated<number>
}

declare module './database.ts' {
  interface Database {
    users: UsersTable
  }
}
