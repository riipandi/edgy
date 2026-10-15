import { Schema } from 'effect'
import { paginationQuery } from '../../kernel/http/pagination.ts'
import { defineId } from '../../kernel/objectids.ts'

const EmailSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMaxLength(254),
    Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'must be a valid email address' })
  )
)

/** TypeID with the `user_` prefix, minted by the repository on insert. */
export const UserId = defineId('user')

export const UserIdSchema = UserId.schema

/** Non-blank, at most 200 characters. */
const NameSchema = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(200), Schema.isPattern(/\S/, { message: 'must not be blank' }))
)

/**
 * The single source of truth for the resource: the request, response and table types derive from it,
 * so a new column is declared once. A schema value is `<Name>Schema`; its inferred type is `<Name>`.
 */
export const UserSchema = Schema.Struct({
  id: UserIdSchema,
  email: EmailSchema,
  name: NameSchema
})

export type User = typeof UserSchema.Type

/** JSON body accepted by `POST /users`; both fields are required. */
export const UserCreateRequestSchema = Schema.Struct({
  email: EmailSchema,
  name: NameSchema
})

export type UserCreateRequest = typeof UserCreateRequestSchema.Type

/** `:id` must be a `user_` TypeID; anything else is a `400` before a query is built. */
export const UserIdParamsSchema = Schema.Struct({ id: UserIdSchema })

/** Columns `GET /users` may be sorted by; anything else is a `400`. */
const userSortKeys = ['id', 'email', 'name'] as const

export type UserSortKey = (typeof userSortKeys)[number]

/** The order of a list that names none. */
export const DEFAULT_SORT = { sortBy: 'id' } as const satisfies { sortBy: UserSortKey }

/** Query of `GET /users`: `limit`, `cursor`, `sort_by`, `sort_order`. */
export const UserListQuerySchema = paginationQuery(userSortKeys, DEFAULT_SORT)

/**
 * Responses encode through these schemas, so only declared fields reach the client, and a column added
 * later does not leak through `selectAll()`. A collection declares its item; the page wraps it.
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
