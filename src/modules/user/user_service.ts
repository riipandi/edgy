import { Cache, Context, Effect, Layer } from 'effect'
import type { User } from '#/database/schema.ts'
import { makeUserCache } from '#/kernel/cache/users.ts'
import { UserRepository } from './user_repo.ts'

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: () => Effect.Effect<readonly User[], unknown>
    readonly find: (id: string) => Effect.Effect<User | undefined, unknown>
  }
>()('app/UserService') {}

export const layer = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const cache = yield* makeUserCache((id) => Effect.orDie(repo.find(id)))
    return UserService.of({
      list: () => repo.list(),
      find: (id) => Cache.get(cache, id)
    })
  })
)
