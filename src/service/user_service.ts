import { Cache, Context, Duration, Effect, Layer, Request, RequestResolver } from 'effect'
import { type DatabaseError, NotFound } from '../kernel/errors.ts'
import { UserRepository } from '../repository/user_repo.ts'
import type { User, UserCreateRequest } from '../schemas/user_schema.ts'

/**
 * Cache key and resolver request for one user. Deliberately not named
 * `*Request`: that suffix is reserved for HTTP request schemas.
 */
interface UserLookup extends Request.Request<User | undefined, DatabaseError> {
  readonly _tag: 'UserLookup'
  readonly id: number
}

const UserLookup = Request.tagged<UserLookup>('UserLookup')

/** Business operations on users. Handlers depend on this key only. */
export class UserService extends Context.Service<
  UserService,
  {
    /** Returns a user or fails with `NotFound`. Reads are served through a cache. */
    readonly get: (id: number) => Effect.Effect<User, NotFound | DatabaseError>
    /** Returns every user. */
    readonly list: Effect.Effect<Array<User>, DatabaseError>
    /** Creates a user from validated input. */
    readonly create: (input: UserCreateRequest) => Effect.Effect<User, DatabaseError>
  }
>()('UserService') {
  /**
   * The read-through cache is private to this layer: it is keyed by request
   * equality (the id), holds 256 entries and expires after 30 seconds, so reads
   * can be up to 30s stale. Writes and `list` bypass it.
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
        timeToLive: () => Duration.seconds(30)
      })

      return UserService.of({
        get: Effect.fn('UserService.get')(function* (id: number) {
          const user = yield* Cache.get(cache, UserLookup({ id }))
          if (user === undefined) return yield* new NotFound({ id })
          return user
        }),
        list: repository.findAll,
        create: Effect.fn('UserService.create')((input: UserCreateRequest) =>
          repository.insert(input)
        )
      })
    })
  )
}
