import { Effect, Layer } from 'effect'
import { Context } from 'effect'
import type { User } from '#/database/schema.ts'
import { Database } from '#/database/service.ts'

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: () => Effect.Effect<readonly User[], unknown>
    readonly find: (id: string) => Effect.Effect<User | undefined, unknown>
  }
>()('app/UserRepository') {}

export const layer = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const db = yield* Database
    return UserRepository.of({
      list: () =>
        Effect.tryPromise(() => db.selectFrom('users').selectAll().orderBy('id', 'asc').execute()),
      find: (id) =>
        Effect.tryPromise(() =>
          db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
        )
    })
  })
)
