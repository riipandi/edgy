import { NodeRedis } from '@effect/platform-node'
import { Cache, Duration, Effect, Layer, Redacted, Schema, type Scope } from 'effect'
import { Persistable, PersistedCache, Persistence } from 'effect/persistence'
import type { PersistenceError } from 'effect/persistence/Persistence'
import type { SchemaError } from 'effect/Schema'

/**
 * The generic lookup-cache adapter: a feature hands over its lookup and the
 * schemas needed to serialize results, and chooses whether entries live in
 * process memory or in shared Redis. Framework primitives underneath: the
 * in-memory `Cache`, and `PersistedCache` over a Redis-backed `Persistence`.
 */
export interface LookupCache<A, E> {
  readonly get: (key: string) => Effect.Effect<A, E>
  readonly invalidate: (key: string) => Effect.Effect<void>
}

export type LookupCacheStorage =
  | { readonly _tag: 'memory' }
  | { readonly _tag: 'redis'; readonly url: Redacted.Redacted; readonly storeId: string }

export interface LookupCacheOptions<A, E> {
  readonly capacity: number
  readonly timeToLive: Duration.Duration
  readonly storage: LookupCacheStorage
  readonly success: Schema.Schema<A>
  readonly error: Schema.Schema<E>
  readonly lookup: (key: string) => Effect.Effect<A, E>
}

// Cache-backend failures degrade to a direct lookup instead of failing the
// request: the cache is an optimization, not a dependency.
const isBackendError = (error: unknown): boolean => {
  const tag = (error as { _tag?: string } | undefined)?._tag
  return tag === 'PersistenceError' || tag === 'SchemaError'
}

export const makeLookupCache = <A, E>(
  options: LookupCacheOptions<A, E>
): Effect.Effect<LookupCache<A, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    if (options.storage._tag !== 'redis') {
      const cache = yield* Cache.make<string, A, E, never>({
        capacity: options.capacity,
        timeToLive: options.timeToLive,
        lookup: options.lookup
      })
      return {
        get: (key) => Cache.get(cache, key),
        invalidate: (key) => Cache.invalidate(cache, key)
      } satisfies LookupCache<A, E>
    }

    const { url, storeId } = options.storage
    const Key = Persistable.Class<{ payload: { readonly id: string } }>()('LookupCacheEntry', {
      primaryKey: (payload) => `${storeId}:${payload.id}`,
      success: options.success,
      error: options.error
    })
    type Key = InstanceType<typeof Key>
    // The generic surface of PersistedCache over a runtime-built Persistable
    // key does not flow through inference; the adapter narrows it here.
    interface PersistedLookup {
      readonly get: (key: Key) => Effect.Effect<A, E | PersistenceError | SchemaError, never>
      readonly invalidate: (key: Key) => Effect.Effect<void, PersistenceError, never>
    }
    // The backing stack must live in the enclosing scope: building it inside
    // Effect.provide would close the Redis client as soon as the cache is
    // constructed.
    const context = yield* Effect.orDie(
      Layer.build(
        Persistence.layerRedis.pipe(Layer.provide(NodeRedis.layer({ url: Redacted.value(url) })))
      )
    )
    const persisted = (yield* PersistedCache.make((key: Key) => options.lookup(key.id), {
      storeId,
      timeToLive: () => options.timeToLive,
      inMemoryCapacity: options.capacity,
      inMemoryTTL: () => options.timeToLive
    }).pipe(Effect.provide(context), Effect.orDie)) as unknown as PersistedLookup
    return {
      get: (key) =>
        persisted
          .get(new Key({ id: key }))
          .pipe(
            Effect.catch((error) =>
              isBackendError(error) ? options.lookup(key) : Effect.fail(error as E)
            )
          ),
      invalidate: (key) => persisted.invalidate(new Key({ id: key })).pipe(Effect.ignore)
    } satisfies LookupCache<A, E>
  })
