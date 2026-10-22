import { Context, Effect, Layer, Schema } from 'effect'
import { Cacheable } from '#/kernel/cache.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import { UserSchema, type User } from './user_schema.ts'

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (id: string) => Effect.Effect<User | undefined, UserRepositoryError>
  }
>()('UserService') {}

export const UserCache = Cacheable.Class<{
  value: User | undefined
  failure: UserRepositoryError
}>()('UserCache', {
  success: Schema.UndefinedOr(UserSchema),
  error: UserRepositoryError,
  lookup: (id) => UserRepository.use((repo) => repo.find(id))
})

export const UserServiceLayer = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const cache = yield* UserCache
    return UserService.of({
      list: () => repo.list(),
      find: (id) => cache.get(id)
    })
  })
)
