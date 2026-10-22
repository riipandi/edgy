import { Cache, Context, Effect, Layer } from 'effect'
import type { User } from '#/database/schema.ts'
import type { DatabaseError } from '#/database/service.ts'
import { makeUserCache } from '#/kernel/cache/users.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { UserRepository } from './user_repo.ts'

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: () => Effect.Effect<readonly User[], DatabaseError>
    readonly find: (id: string) => Effect.Effect<User | undefined, DatabaseError>
  }
>()('app/UserService') {}

export const layer = Layer.effect(
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
