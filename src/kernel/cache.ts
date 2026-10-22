import { NodeRedis } from '@effect/platform-node'
import { Cache, Context, Effect, Layer, Redacted, Schema, type Scope } from 'effect'
import { Persistable, PersistedCache, Persistence } from 'effect/persistence'
import type { PersistenceError } from 'effect/persistence/Persistence'
import type { SchemaError } from 'effect/Schema'
import { AppConfig } from './config/config.ts'

/**
 * The surface a `Cacheable.Class` tag carries: a keyed lookup with failure
 * invalidation built in, and explicit invalidation for writers.
 */
export interface CacheableService<A, E> {
  readonly get: (key: string) => Effect.Effect<A, E>
  readonly invalidate: (key: string) => Effect.Effect<void>
}

interface CacheableConfig {
  readonly value: unknown
  readonly failure: unknown
}

interface CacheableOptions<A, E, R> {
  readonly success: Schema.Schema<A>
  readonly error: Schema.Schema<E>
  readonly lookup: (key: string) => Effect.Effect<A, E, R>
}

// Cache-backend failures degrade to a direct lookup instead of failing the
// request: the cache is an optimization, not a dependency.
const isBackendError = (error: unknown): boolean => {
  const tag = (error as { _tag?: string } | undefined)?._tag
  return tag === 'PersistenceError' || tag === 'SchemaError'
}

interface CacheableBacking<A, E, R> {
  readonly get: (key: string) => Effect.Effect<A, E | PersistenceError | SchemaError, R>
  readonly invalidate: (key: string) => Effect.Effect<void>
}

const buildService = <A, E, R>(
  identifier: string,
  options: CacheableOptions<A, E, R>
): Effect.Effect<CacheableService<A, E>, never, AppConfig | R | Scope.Scope> =>
  Effect.gen(function* () {
    const config = yield* AppConfig
    // The lookup's requirements are resolved once at layer build and captured
    // into the service, so consumers get a plain Effect<A, E>.
    const context = yield* Effect.context<AppConfig | R>()
    if (!config.cache.enabled) {
      return {
        get: (key) => options.lookup(key).pipe(Effect.provide(context)),
        invalidate: () => Effect.void
      } satisfies CacheableService<A, E>
    }
    let backing: CacheableBacking<A, E, R>
    if (config.cache.storage !== 'redis') {
      const cache = yield* Cache.make<string, A, E, R>({
        capacity: config.cache.maxEntries,
        timeToLive: config.cache.ttl,
        lookup: options.lookup
      })
      backing = {
        get: (key) => Cache.get(cache, key),
        invalidate: (key) => Cache.invalidate(cache, key)
      }
    } else {
      const Key = Persistable.Class<{ payload: { readonly id: string } }>()(identifier, {
        primaryKey: (payload) => payload.id,
        success: options.success,
        error: options.error
      })
      type Key = InstanceType<typeof Key>
      // The generic surface of PersistedCache over a runtime-built Persistable
      // key does not flow through inference; the adapter narrows it here.
      interface PersistedLookup {
        readonly get: (key: Key) => Effect.Effect<A, E | PersistenceError | SchemaError, R>
        readonly invalidate: (key: Key) => Effect.Effect<void, PersistenceError>
      }
      // The backing stack must live in the enclosing scope: building it inside
      // Effect.provide would close the Redis client as soon as the cache is
      // constructed.
      const context = yield* Effect.orDie(
        Layer.build(
          Persistence.layerRedis.pipe(
            Layer.provide(NodeRedis.layer({ url: Redacted.value(config.cache.redisUrl) }))
          )
        )
      )
      const persisted = (yield* PersistedCache.make((key: Key) => options.lookup(key.id), {
        storeId: identifier,
        timeToLive: () => config.cache.ttl,
        inMemoryCapacity: config.cache.maxEntries,
        inMemoryTTL: () => config.cache.ttl
      }).pipe(Effect.provide(context), Effect.orDie)) as unknown as PersistedLookup
      backing = {
        get: (key) => persisted.get(new Key({ id: key })),
        invalidate: (key) => persisted.invalidate(new Key({ id: key })).pipe(Effect.ignore)
      }
    }
    return {
      get: (key) =>
        backing
          .get(key)
          .pipe(
            Effect.catch((error) =>
              isBackendError(error) ? options.lookup(key) : Effect.fail(error as E)
            ),
            // A failed lookup must not stay pinned until the TTL expires: drop
            // the entry so the next request retries the lookup.
            Effect.catch((error) =>
              Effect.flatMap(backing.invalidate(key), () => Effect.fail(error))
            )
          )
          .pipe(Effect.provide(context)),
      invalidate: (key) => backing.invalidate(key)
    } satisfies CacheableService<A, E>
  })

export const Cacheable = {
  /**
   * Declares a feature-scoped cache as a service tag. The tag's `layer`
   * resolves the cache configuration and the storage backend; yield the tag
   * where the lookups happen.
   */
  Class: function <Config extends CacheableConfig>() {
    return <const Tag extends string, R = never>(
      identifier: Tag,
      options: {
        readonly success: Schema.Schema<Config['value']>
        readonly error: Schema.Schema<Config['failure']>
        readonly lookup: (key: string) => Effect.Effect<Config['value'], Config['failure'], R>
      }
    ) => {
      const tag = Context.Service<any, CacheableService<Config['value'], Config['failure']>>()(
        identifier
      )
      const layer = Layer.effect(tag, buildService(identifier, options))
      return Object.assign(tag, { layer })
    }
  }
}
