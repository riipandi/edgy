import { Context, Effect, Layer, Schema } from 'effect'
import { Persistable, type Persistence } from 'effect/persistence'
import { makeReadThrough } from '../../kernel/cache/read_through.ts'
import type { ConfigService } from '../../kernel/config/service.ts'
import { DatabaseError, type Conflict } from '../../kernel/errors.ts'
import { NotFound } from '../../kernel/errors.ts'
import type { Page, PageRequest } from '../../kernel/pagination.ts'
import { UserRepository } from './user_repo.ts'
import { type User, type UserCreateRequest, UserSchema, type UserSortKey } from './user_schema.ts'

declare module '../../kernel/http/runtime.ts' {
  interface HttpServices {
    user: UserService
  }
}

/**
 * Cache key for one user, and what the cache stores under it: the user, or `null` for an id
 * that is known not to exist (so a probe for a missing id does not reach the database each
 * time). The error schema only types the lookup's failure; a failure is never stored.
 * Deliberately not named `*Request`: that suffix is reserved for HTTP request schemas.
 */
class UserLookup extends Persistable.Class<{ payload: { readonly id: string } }>()('UserLookup', {
  primaryKey: ({ id }) => id,
  success: Schema.NullOr(UserSchema),
  error: Schema.instanceOf(DatabaseError)
}) {}

/** Business operations on users. Handlers depend on this key only. */
export class UserService extends Context.Service<
  UserService,
  {
    /** Returns a user or fails with `NotFound`. Reads are served through a cache. */
    readonly get: (id: string) => Effect.Effect<User, NotFound | DatabaseError>
    /** Returns one page of users. Lists bypass the cache. */
    readonly list: (request: PageRequest<UserSortKey>) => Effect.Effect<Page<User>, DatabaseError>
    /** Creates a user from validated input. */
    readonly create: (input: UserCreateRequest) => Effect.Effect<User, Conflict | DatabaseError>
  }
>()('UserService') {
  /**
   * `get` reads through a cache shaped by `CACHE_*` (`makeReadThrough`): off, in this process,
   * or in a shared store with a short local copy on top. Every write invalidates the key it
   * touches, so the staleness bound only covers writes made by another instance (and, for a
   * shared store with a local copy, `CACHE_LOCAL_TTL`). `?nocache=true` skips it for one
   * request. `list` bypasses the cache.
   */
  static readonly layer: Layer.Layer<
    UserService,
    never,
    UserRepository | ConfigService | Persistence.Persistence
  > = Layer.effect(
    UserService,
    Effect.gen(function* () {
      const repository = yield* UserRepository

      const cache = yield* makeReadThrough({
        name: 'users',
        lookup: (key: UserLookup) =>
          repository.findById(key.id).pipe(Effect.map((user) => user ?? null))
      })

      return UserService.of({
        get: Effect.fn('UserService.get')(function* (id: string) {
          const user = yield* cache.get(new UserLookup({ id }))
          if (user === null) return yield* new NotFound({ resource: 'User', id })
          return user
        }),
        list: repository.findPage,
        // Write policy: a write invalidates the cache keys it touches. A lookup of an id that
        // did not exist is cached as `null`, so without this the user just created would stay
        // "not found" until the entry expired.
        create: Effect.fn('UserService.create')(function* (input: UserCreateRequest) {
          const user = yield* repository.insert(input)
          yield* cache.invalidate(new UserLookup({ id: user.id }))
          return user
        })
      })
    })
  )
}
