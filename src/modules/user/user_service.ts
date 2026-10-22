import { Context, Effect, Layer, Schema } from 'effect'
import { Cacheable, type CacheStatus } from '#/kernel/cache.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import { parseUserId, UserSchema } from './user_schema.ts'
import type { User, UserIdType } from './user_schema.ts'

export interface UserResult {
  readonly user: User | undefined
  readonly cache: CacheStatus
}

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (
      id: UserIdType,
      bypass?: boolean
    ) => Effect.Effect<UserResult, UserRepositoryError>
  }
>()('UserService') {}

export const UserCache = Cacheable.Class<{
  value: User | undefined
  failure: UserRepositoryError
}>()('UserCache', {
  success: Schema.UndefinedOr(UserSchema),
  error: UserRepositoryError,
  lookup: (key) => UserRepository.use((repo) => repo.find(parseUserId(key)))
})

export const UserServiceLayer = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const cache = yield* UserCache
    const find = (id: UserIdType, bypass = false) => {
      const userId = id.toString()
      return (bypass ? cache.bypass(userId) : cache.get(userId)).pipe(
        Effect.map(([user, cache]) => ({ user, cache }))
      )
    }
    return UserService.of({
      list: () => repo.list(),
      find
    })
  })
)
