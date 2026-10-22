import { Context, Effect, Exit, Layer, Schema } from 'effect'
import { makeLookupCache } from '#/kernel/cache.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import { UserSchema, type User } from './user_schema.ts'

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
      ? yield* makeLookupCache({
          capacity: config.cache.maxEntries,
          timeToLive: config.cache.ttl,
          storage:
            config.cache.storage === 'redis'
              ? { _tag: 'redis', url: config.cache.redisUrl, storeId: 'user-lookup' }
              : { _tag: 'memory' },
          success: Schema.UndefinedOr(UserSchema),
          error: UserRepositoryError,
          lookup: (id) => repo.find(id)
        })
      : undefined
    // A failed lookup must not stay pinned until the TTL expires: drop the
    // entry so the next request retries the repository.
    const find = (id: string) => {
      if (cache === undefined) return repo.find(id)
      return Effect.exit(cache.get(id)).pipe(
        Effect.flatMap((exit) =>
          Exit.isSuccess(exit)
            ? Effect.succeed(exit.value)
            : Effect.flatMap(cache.invalidate(id), () => Effect.failCause(exit.cause))
        )
      )
    }
    return UserService.of({ list: () => repo.list(), find })
  })
)
