import { Context, Effect, Layer, Schema } from 'effect'
import { Database } from '#/database/adapter.ts'
import type { User, UserInsert, UserIdType } from './user_schema.ts'

export type UserSortColumn = 'id' | 'created_at'
export type SortOrder = 'asc' | 'desc'

// The index signature is what lets encodeCursor/decodeCursor's generic
// CursorPayload constraint accept this shape.
export interface ListCursor {
  readonly [key: string]: string
  readonly sortValue: string
  readonly id: string
}

export interface ListUsersOptions {
  readonly limit: number
  readonly sortBy: UserSortColumn
  readonly sortOrder: SortOrder
  readonly cursor?: ListCursor
}

export interface ListUsersResult {
  readonly users: readonly User[]
  readonly hasMore: boolean
}

export class UserRepositoryError extends Schema.TaggedError<UserRepositoryError>()(
  'UserRepositoryError',
  { cause: Schema.Defect() }
) {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

export class UserEmailConflict extends Schema.TaggedError<UserEmailConflict>()(
  'UserEmailConflict',
  { email: Schema.String }
) {
  override get message(): string {
    return `A user with email ${this.email} already exists`
  }
}

// The local driver reports unique violations as a plain Error whose message
// carries the constraint (code is a useless "GenericFailure"); the remote
// transport is assumed to relay the same SQLite text.
const isEmailTaken = (cause: unknown): boolean => {
  for (let current = cause; current instanceof Error; current = current.cause) {
    if (/UNIQUE constraint failed: users\.email/.test(current.message)) return true
  }
  return false
}

export interface CreateUserValues {
  readonly email: string
  readonly name: string | null
  readonly avatar_url: string | null
}

export interface UpdateUserPatch {
  readonly email?: string
  readonly name?: string | null
  readonly avatar_url?: string | null
}

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: (
      options: ListUsersOptions
    ) => Effect.Effect<ListUsersResult, UserRepositoryError>
    readonly find: (id: UserIdType) => Effect.Effect<User | undefined, UserRepositoryError>
    readonly findByEmail: (email: string) => Effect.Effect<User | undefined, UserRepositoryError>
    readonly create: (
      id: UserIdType,
      values: CreateUserValues
    ) => Effect.Effect<User, UserRepositoryError | UserEmailConflict>
    readonly update: (
      id: UserIdType,
      patch: UpdateUserPatch
    ) => Effect.Effect<User | undefined, UserRepositoryError | UserEmailConflict>
    readonly remove: (id: UserIdType) => Effect.Effect<boolean, UserRepositoryError>
  }
>()('UserRepository') {}

// Kysely's insert type does not honor `defaultTo(sql\`…\`)` defaults, so the
// storage layer stamps the storage columns itself, in the seeders' format.
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

export const UserRepositoryLayer = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const database = yield* Database
    const mapError = (cause: unknown) => new UserRepositoryError({ cause })
    // Keyset pagination: the sort column plus `id` as a tiebreaker, so rows
    // sharing a sort value (e.g. the same created_at) still page in a stable
    // order. One extra row is fetched to detect whether a next page exists.
    const list = (options: ListUsersOptions) =>
      database
        .read((db) => {
          let query = db
            .selectFrom('users')
            .selectAll()
            .orderBy(options.sortBy, options.sortOrder)
            .orderBy('id', options.sortOrder)
            .limit(options.limit + 1)
          if (options.cursor !== undefined) {
            const cursor = options.cursor
            const op = options.sortOrder === 'asc' ? '>' : '<'
            query = query.where((eb) =>
              eb.or([
                eb(options.sortBy, op, cursor.sortValue),
                eb.and([eb(options.sortBy, '=', cursor.sortValue), eb('id', op, cursor.id)])
              ])
            )
          }
          return query.execute()
        })
        .pipe(
          Effect.map((rows) => ({
            users: rows.length > options.limit ? rows.slice(0, options.limit) : rows,
            hasMore: rows.length > options.limit
          })),
          Effect.mapError(mapError)
        )
    const find = (id: UserIdType) =>
      database
        .read((db) =>
          db.selectFrom('users').selectAll().where('id', '=', id.toString()).executeTakeFirst()
        )
        .pipe(Effect.mapError(mapError))
    const findByEmail = (email: string) =>
      database
        .read((db) =>
          db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst()
        )
        .pipe(Effect.mapError(mapError))
    const create = (id: UserIdType, values: CreateUserValues) =>
      database
        .query((db) => {
          const row: UserInsert = {
            id: id.toString(),
            email: values.email,
            name: values.name,
            avatar_url: values.avatar_url,
            role: 10,
            email_verified: 0,
            data: null,
            disabled: 0,
            created_at: now(),
            updated_at: now()
          }
          return db.insertInto('users').values(row).returningAll().executeTakeFirstOrThrow()
        })
        .pipe(
          Effect.mapError((cause) =>
            isEmailTaken(cause)
              ? new UserEmailConflict({ email: values.email })
              : new UserRepositoryError({ cause })
          )
        )
    const update = (id: UserIdType, patch: UpdateUserPatch) =>
      database
        .query((db) =>
          db
            .updateTable('users')
            .set({
              ...('email' in patch ? { email: patch.email } : {}),
              ...('name' in patch ? { name: patch.name } : {}),
              ...('avatar_url' in patch ? { avatar_url: patch.avatar_url } : {}),
              updated_at: now()
            })
            .where('id', '=', id.toString())
            .returningAll()
            .executeTakeFirst()
        )
        .pipe(
          Effect.mapError((cause) =>
            patch.email !== undefined && isEmailTaken(cause)
              ? new UserEmailConflict({ email: patch.email })
              : new UserRepositoryError({ cause })
          )
        )
    const remove = (id: UserIdType) =>
      database
        .query((db) =>
          db.deleteFrom('users').where('id', '=', id.toString()).returningAll().executeTakeFirst()
        )
        .pipe(
          Effect.map((deleted) => deleted !== undefined),
          Effect.mapError(mapError)
        )

    return UserRepository.of({ list, find, findByEmail, create, update, remove })
  })
)
