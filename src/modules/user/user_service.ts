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
 * Cache key for one user, and the value stored under it: the user, or `null` for an id known not to
 * exist, so probes for a missing id do not reach the database. Failures are never stored. Not named
 * `*Request`, a suffix reserved for HTTP request schemas.
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
   * `get` reads through a cache configured by `CACHE_*`: off, in-process, or a shared store with a
   * short local copy on top. Writes invalidate the keys they touch, so staleness is bounded only for
   * writes made by another instance (and by `CACHE_LOCAL_TTL` with a local copy). `?nocache=true`
   * skips the cache for one request. `list` bypasses it.
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
        // A missing id is cached as `null`. Without this invalidation, a user just created would read as
        // not found until the entry expired.
        create: Effect.fn('UserService.create')(function* (input: UserCreateRequest) {
          const user = yield* repository.insert(input)
          yield* cache.invalidate(new UserLookup({ id: user.id }))
          return user
        })
      })
    })
  )
}
