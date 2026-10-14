import { Cache, Context, Duration, Effect, Layer, Request, RequestResolver } from 'effect'
import { DatabaseService } from '../database/runtime.ts'
import { DatabaseError, NotFound } from '../httputils/errors.ts'
import type { CreateUserInput } from '../httputils/validator.ts'
import type { UserRow } from '../schemas/user_schema.ts'
import { findAllUsers, findUserById, insertUser } from '../stores/user_store.ts'

// --- Batched reads via Effect's Request / RequestResolver ---

/**
 * Typed request for a single user. Requests are plain data descriptions; the
 * resolver below decides how to execute them.
 */
interface GetUserRequest extends Request.Request<UserRow | undefined, DatabaseError> {
  readonly _tag: 'GetUserRequest'
  readonly id: number
}

const GetUserRequest = Request.tagged<GetUserRequest>('GetUserRequest')

/**
 * Read-through cache for `getUser`, keyed by request equality (the id).
 * Entries expire after a short TTL so reads stay fresh.
 */
export class UserCache extends Context.Service<
  UserCache,
  Cache.Cache<GetUserRequest, UserRow | undefined, DatabaseError>
>()('UserCache') {}

/**
 * Builds the cache from the database layer. The resolver captures the database
 * service at construction, so cache lookups require only `UserCache`.
 */
export const UserCacheLayer: Layer.Layer<UserCache, never, DatabaseService> = Layer.effect(
  UserCache,
  Effect.gen(function* () {
    const database = yield* DatabaseService

    const resolver = RequestResolver.fromEffect((entry: Request.Entry<GetUserRequest>) =>
      findUserById(entry.request.id).pipe(Effect.provideService(DatabaseService, database))
    )

    return yield* RequestResolver.asCache(resolver, {
      capacity: 256,
      timeToLive: () => Duration.seconds(30)
    })
  })
)

// --- Public service API ---

/**
 * Returns a user or fails with `NotFound`. Reads are served through the cache.
 */
export const getUser = (id: number): Effect.Effect<UserRow, NotFound | DatabaseError, UserCache> =>
  UserCache.use((cache) => Cache.get(cache, GetUserRequest({ id }))).pipe(
    Effect.flatMap((user) => (user ? Effect.succeed(user) : Effect.fail(new NotFound({ id })))),
    Effect.withSpan('UserService.getUser', { attributes: { userId: id } })
  )

/** Returns every user. */
export const listUsers = (): Effect.Effect<Array<UserRow>, DatabaseError, DatabaseService> =>
  findAllUsers()

/** Creates a user from validated input. */
export const createUser = (
  input: CreateUserInput
): Effect.Effect<UserRow, DatabaseError, DatabaseService> => insertUser(input)
