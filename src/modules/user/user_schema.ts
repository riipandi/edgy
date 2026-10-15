import { Schema } from 'effect'
import { paginationQuery } from '../../kernel/http/pagination.ts'
import { idSchema } from '../../kernel/ids.ts'

const EmailSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMaxLength(254),
    Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'must be a valid email address' })
  )
)

/** A `user_` TypeID, minted by the repository on insert. */
export const UserIdSchema = idSchema('user')

const NameSchema = Schema.String.pipe(Schema.check(Schema.isMaxLength(200)))

/**
 * `UserSchema` is the single source of truth for the resource: the request,
 * response and Kysely table types below are all derived from it, so a new
 * column is declared once.
 *
 * Naming: a schema value is `<Name>Schema`; the type inferred from it is plain
 * `<Name>` and is exported only when code consumes it.
 */
export const UserSchema = Schema.Struct({
  id: UserIdSchema,
  email: EmailSchema,
  name: Schema.NullOr(NameSchema)
})

export type User = typeof UserSchema.Type

/** JSON body accepted by `POST /users`; `name` may be omitted. */
export const UserCreateRequestSchema = Schema.Struct({
  email: EmailSchema,
  name: Schema.optional(NameSchema)
})

export type UserCreateRequest = typeof UserCreateRequestSchema.Type

/** `:id` must be a `user_` TypeID; anything else is a `400` before a query is built. */
export const UserIdParamsSchema = Schema.Struct({ id: UserIdSchema })

/** Columns `GET /users` may be sorted by; anything else is a `400`. */
const userSortKeys = ['id', 'email', 'name'] as const

export type UserSortKey = (typeof userSortKeys)[number]

/** Query of `GET /users`: `page`, `limit`, `sort_by`, `sort_order`. */
export const UserListQuerySchema = paginationQuery(userSortKeys)

/**
 * Response data is encoded through these schemas, so only the declared fields
 * ever reach the client — a column added to the table later does not leak
 * through `selectAll()`. A collection declares its item; the page wraps it.
 */
export const UserGetResponseSchema = UserSchema
export const UserListItemSchema = UserSchema
export const UserCreateResponseSchema = UserSchema

/** Row shape of the `users` table: the entity itself, its id included. */
export type UsersTable = User

declare module '../../database/schema.ts' {
  interface Database {
    users: UsersTable
  }
}
