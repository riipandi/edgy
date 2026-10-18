import { Effect, Layer } from 'effect'
import { Context } from 'effect'
import type { User } from '../../database/schema.ts'
import { Database } from '../../database/service.ts'

export class UserRepo extends Context.Service<
  UserRepo,
  {
    readonly list: () => Effect.Effect<readonly User[], unknown>
    readonly find: (id: string) => Effect.Effect<User | undefined, unknown>
  }
>()('app/UserRepo') {}

export const layer = Layer.effect(
  UserRepo,
  Effect.gen(function* () {
    const db = yield* Database
    return UserRepo.of({
      list: () =>
        Effect.tryPromise(() => db.selectFrom('users').selectAll().orderBy('id', 'asc').execute()),
      find: (id) =>
        Effect.tryPromise(() =>
          db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
        )
    })
  })
)
