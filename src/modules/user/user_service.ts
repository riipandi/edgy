import { Cache, Context, Effect, Layer } from 'effect'
import { makeUserCache } from '#/kernel/cache/users.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { UserRepository, type UserRepositoryError } from './user_repo.ts'
import type { User } from './user_schema.ts'

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (id: string) => Effect.Effect<User | undefined, UserRepositoryError>
  }
>()('UserService') {}

export const UserServiceLayer = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const config = yield* AppConfig
    const cache = config.cache.enabled
      ? yield* makeUserCache(config.cache, (id) => repo.find(id))
      : undefined
    return UserService.of({
      list: () => repo.list(),
      find: (id) => (cache === undefined ? repo.find(id) : Cache.get(cache, id))
    })
  })
)
