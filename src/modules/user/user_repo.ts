import { Context, Effect, Layer, Schema } from 'effect'
import { Database } from '#/database/adapter.ts'
import type { User, UserInsert, UserIdType } from './user_schema.ts'

export class UserRepositoryError extends Schema.TaggedError<UserRepositoryError>()(
  'UserRepositoryError',
  { cause: Schema.Defect() }
) {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
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
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (id: UserIdType) => Effect.Effect<User | undefined, UserRepositoryError>
    readonly findByEmail: (email: string) => Effect.Effect<User | undefined, UserRepositoryError>
    readonly create: (
      id: UserIdType,
      values: CreateUserValues
    ) => Effect.Effect<User, UserRepositoryError>
    readonly update: (
      id: UserIdType,
      patch: UpdateUserPatch
    ) => Effect.Effect<User | undefined, UserRepositoryError>
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
    const list = () =>
      database
        .read((db) => db.selectFrom('users').selectAll().orderBy('id', 'asc').execute())
        .pipe(Effect.mapError(mapError))
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
        .pipe(Effect.mapError(mapError))
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
        .pipe(Effect.mapError(mapError))
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
