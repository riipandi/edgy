import { Context, Effect, Layer, Schema } from 'effect'
import { Cacheable, type CacheStatus } from '#/kernel/cache.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import type {
  CreateUserValues,
  ListUsersOptions,
  ListUsersResult,
  UpdateUserPatch
} from './user_repo.ts'
import { parseUserId, generateUserId, UserSchema } from './user_schema.ts'
import type { User, UserIdType } from './user_schema.ts'

export interface UserResult {
  readonly user: User | undefined
  readonly cache: CacheStatus
}

export class UserEmailConflict extends Schema.TaggedError<UserEmailConflict>()(
  'UserEmailConflict',
  { email: Schema.String }
) {
  override get message(): string {
    return `A user with email ${this.email} already exists`
  }
}

export class UserService extends Context.Service<
  UserService,
  {
    readonly list: (
      options: ListUsersOptions
    ) => Effect.Effect<ListUsersResult, UserRepositoryError>
    readonly find: (
      id: UserIdType,
      bypass?: boolean
    ) => Effect.Effect<UserResult, UserRepositoryError>
    readonly create: (
      values: CreateUserValues
    ) => Effect.Effect<User, UserEmailConflict | UserRepositoryError>
    readonly update: (
      id: UserIdType,
      patch: UpdateUserPatch
    ) => Effect.Effect<User | undefined, UserEmailConflict | UserRepositoryError>
    readonly remove: (id: UserIdType) => Effect.Effect<boolean, UserRepositoryError>
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

export type UserWriteError = UserEmailConflict | UserRepositoryError

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
    const conflict = (email: string) =>
      Effect.fail<UserWriteError>(new UserEmailConflict({ email }))
    const create = (values: CreateUserValues): Effect.Effect<User, UserWriteError> =>
      Effect.flatMap(repo.findByEmail(values.email), (existing) =>
        existing === undefined ? repo.create(generateUserId(), values) : conflict(values.email)
      )
    const update = (
      id: UserIdType,
      patch: UpdateUserPatch
    ): Effect.Effect<User | undefined, UserWriteError> =>
      (patch.email === undefined ? Effect.succeed(undefined) : repo.findByEmail(patch.email)).pipe(
        Effect.flatMap((existing) =>
          existing !== undefined && existing.id !== id.toString()
            ? conflict(patch.email!)
            : repo.update(id, patch)
        ),
        Effect.flatMap((updated) =>
          updated === undefined
            ? Effect.succeed(undefined)
            : cache.invalidate(id.toString()).pipe(Effect.as(updated))
        )
      )
    const remove = (id: UserIdType) =>
      repo
        .remove(id)
        .pipe(
          Effect.flatMap((deleted) =>
            deleted ? Effect.as(cache.invalidate(id.toString()), true) : Effect.succeed(false)
          )
        )
    return UserService.of({ list: repo.list, find, create, update, remove })
  })
)
