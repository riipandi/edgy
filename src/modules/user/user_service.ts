import { Cache, Context, Duration, Effect, Exit, Layer, Request, RequestResolver } from 'effect'
import type { Conflict, DatabaseError } from '../../kernel/errors.ts'
import { NotFound } from '../../kernel/errors.ts'
import type { Page, PageRequest } from '../../kernel/pagination.ts'
import { UserRepository } from './user_repo.ts'
import type { User, UserCreateRequest, UserSortKey } from './user_schema.ts'

declare module '../../kernel/http/runtime.ts' {
  interface HttpServices {
    user: UserService
  }
}

/**
 * Cache key and resolver request for one user. Deliberately not named
 * `*Request`: that suffix is reserved for HTTP request schemas.
 */
interface UserLookup extends Request.Request<User | undefined, DatabaseError> {
  readonly _tag: 'UserLookup'
  readonly id: string
}

const UserLookup = Request.tagged<UserLookup>('UserLookup')

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
   * The read-through cache is private to this layer: it is keyed by request
   * equality (the id), holds 256 entries and expires after 30 seconds (failures are not kept). Every
   * write invalidates the keys it touches, so the staleness bound only covers
   * writes made by another process. `list` bypasses the cache.
   */
  static readonly layer: Layer.Layer<UserService, never, UserRepository> = Layer.effect(
    UserService,
    Effect.gen(function* () {
      const repository = yield* UserRepository

      const resolver = RequestResolver.fromEffect((entry: Request.Entry<UserLookup>) =>
        repository.findById(entry.request.id)
      )
      const cache = yield* RequestResolver.asCache(resolver, {
        capacity: 256,
        // Only a found (or confirmed-missing) user is worth keeping. `Cache` stores
        // failures too, so without this a transient `SQLITE_BUSY` would be replayed
        // to every caller for the whole TTL; a zero TTL makes the next call retry.
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.seconds(30) : Duration.zero)
      })

      return UserService.of({
        get: Effect.fn('UserService.get')(function* (id: string) {
          const user = yield* Cache.get(cache, UserLookup({ id }))
          if (user === undefined) return yield* new NotFound({ resource: 'User', id })
          return user
        }),
        list: repository.findPage,
        // Write policy: a write invalidates the cache keys it touches. A lookup of
        // an id that did not exist is cached as `undefined`, so without this the
        // user just created would stay "not found" until the entry expired.
        create: Effect.fn('UserService.create')(function* (input: UserCreateRequest) {
          const user = yield* repository.insert(input)
          yield* Cache.invalidate(cache, UserLookup({ id: user.id }))
          return user
        })
      })
    })
  )
}
