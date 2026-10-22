import { Context, Effect, Layer } from 'effect'
import type { User } from '#/database/schema.ts'
import { Database, type DatabaseError } from '#/database/service.ts'

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: () => Effect.Effect<readonly User[], DatabaseError>
    readonly find: (id: string) => Effect.Effect<User | undefined, DatabaseError>
  }
>()('app/UserRepository') {}

export const layer = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const database = yield* Database
    return UserRepository.of({
      list: () =>
        database.read((db) => db.selectFrom('users').selectAll().orderBy('id', 'asc').execute()),
      find: (id) =>
        database.read((db) =>
          db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
        )
    })
  })
)
