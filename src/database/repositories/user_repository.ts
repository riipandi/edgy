import { Effect, Layer } from 'effect'
import { Database } from '#/database/service.ts'
import { UserRepository, UserRepositoryError } from '#/modules/user/user_repo.ts'

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
