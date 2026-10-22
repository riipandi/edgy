import { Context, Data, Effect, Layer } from 'effect'
import { Database } from '#/database/service.ts'
import type { User } from './user_schema.ts'

export class UserRepositoryError extends Data.TaggedError('UserRepositoryError')<{
  readonly cause: unknown
}> {}

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (id: string) => Effect.Effect<User | undefined, UserRepositoryError>
  }
>()('UserRepository') {}

export const UserRepositoryLayer = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const database = yield* Database
    const list = () =>
      database
        .read((db) => db.selectFrom('users').selectAll().orderBy('id', 'asc').execute())
        .pipe(Effect.mapError((cause) => new UserRepositoryError({ cause })))
    const find = (id: string) =>
      database
        .read((db) => db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst())
        .pipe(Effect.mapError((cause) => new UserRepositoryError({ cause })))

    return UserRepository.of({ list, find })
  })
)
