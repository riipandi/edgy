import { NodeRedis } from '@effect/platform-node'
import { Cache, Context, Effect, Exit, Layer, Option, Schema, Scope } from 'effect'
import { Persistable, PersistedCache, Persistence } from 'effect/persistence'
import type { PersistenceError } from 'effect/persistence/Persistence'
import type { SchemaError } from 'effect/Schema'
import { awaitRedis } from '#/kernel/redis-boot.ts'
import { annotateSpan, withDependencyTelemetry } from '#/observer/dependencies.ts'
import { AppConfig } from './config/config.ts'
import { redisUrlForDatabase } from './config/redis.ts'

/**
 * The surface a `Cacheable.Class` tag carries: a keyed lookup with failure
 * invalidation built in, and explicit invalidation for writers. `get` pairs
 * the value with where it came from so a caller can report whether a lookup
 * was served from the cache; `bypass` skips the cache entirely (no read, no
 * write).
 */
export type CacheStatus = 'hit' | 'miss' | 'bypass' | 'disabled'

export interface CacheableService<A, E> {
  readonly get: (key: string) => Effect.Effect<readonly [value: A, status: CacheStatus], E>
  readonly bypass: (key: string) => Effect.Effect<readonly [value: A, status: CacheStatus], E>
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

// Reads the backing store without populating it: Some is a hit, None sends
// the caller through the populating path.
interface CacheableBacking<A, E, R> {
  readonly peek: (
    key: string
  ) => Effect.Effect<Option.Option<A>, E | PersistenceError | SchemaError, R>
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
      const direct = (key: string) =>
        options.lookup(key).pipe(
          Effect.provide(context),
          Effect.map((value) => [value, 'disabled'] as const),
          Effect.tap((found) => annotateSpan({ 'cache.status': found[1] })),
          Effect.withSpan('cache.get')
        ) as Effect.Effect<readonly [A, CacheStatus], E>
      return {
        get: direct,
        bypass: direct,
        invalidate: () => Effect.void
      } satisfies CacheableService<A, E>
    }
    let backing: CacheableBacking<A, E, R>
    if (!config.redis.enabled) {
      const cache = yield* Cache.make<string, A, E, R>({
        capacity: config.cache.maxEntries,
        timeToLive: config.cache.ttl,
        lookup: options.lookup
      })
      backing = {
        peek: (key) => Cache.getOption(cache, key),
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
      // Hit detection reads the in-memory layer only: a persisted exit alone
      // is a miss for the response header, not a hit.
      interface PersistedPeek {
        readonly inMemory: Cache.Cache<Key, A, E | PersistenceError | SchemaError, R>
      }
      // The backing stack lives in a scope this code owns: the Redis client's
      // own finalizer sits inside it, so closing that scope is the only place
      // the close can be logged on both sides.
      const redisScope = yield* Scope.make()
      const context = yield* Effect.orDie(
        awaitRedis(
          Layer.build(
            Persistence.layerRedis.pipe(
              Layer.provide(
                NodeRedis.layer({
                  url: redisUrlForDatabase(config.redis.url, 'cache')
                })
              )
            )
          )
        ).pipe(Effect.provideService(Scope.Scope, redisScope))
      )
      const persistedCache = yield* PersistedCache.make((key: Key) => options.lookup(key.id), {
        storeId: identifier,
        timeToLive: () => config.cache.ttl,
        inMemoryCapacity: config.cache.maxEntries,
        inMemoryTTL: () => config.cache.ttl
      }).pipe(Effect.provide(context), Effect.orDie)
      yield* Effect.addFinalizer(() =>
        Effect.logInfo('Closing redis cache connection').pipe(
          Effect.andThen(Scope.close(redisScope, Exit.void)),
          Effect.andThen(Effect.logInfo('Redis cache connection closed'))
        )
      )
      const persisted = persistedCache as unknown as PersistedLookup & PersistedPeek
      backing = {
        peek: (key) => Cache.getOption(persisted.inMemory, new Key({ id: key })),
        get: (key) =>
          persisted
            .get(new Key({ id: key }))
            .pipe(
              withDependencyTelemetry({ store: 'redis', op: 'cache-get', span: 'cache.redis-get' })
            ),
        invalidate: (key) =>
          persisted
            .invalidate(new Key({ id: key }))
            .pipe(Effect.ignore)
            .pipe(
              withDependencyTelemetry({
                store: 'redis',
                op: 'cache-invalidate',
                span: 'cache.redis-invalidate'
              })
            )
      }
    }
    const lookupDirect = (key: string) =>
      options.lookup(key).pipe(
        // A failed lookup must not stay pinned until the TTL expires: drop
        // the entry so the next request retries the lookup.
        Effect.catch((error) =>
          Effect.flatMap(backing.invalidate(key), () => Effect.fail(error as E))
        )
      )
    return {
      get: (key) =>
        backing.peek(key).pipe(
          // Backend read failures degrade to a direct lookup: the cache is an
          // optimization, not a dependency.
          Effect.catch((error) =>
            isBackendError(error) ? Effect.succeed(Option.none<A>()) : Effect.fail(error as E)
          ),
          Effect.flatMap((found): Effect.Effect<readonly [A, CacheStatus], E, R> => {
            if (Option.isSome(found)) return Effect.succeed([found.value, 'hit'] as const)
            return backing.get(key).pipe(
              Effect.catch((error) =>
                isBackendError(error) ? options.lookup(key) : Effect.fail(error as E)
              ),
              Effect.catch((error) =>
                Effect.flatMap(backing.invalidate(key), () => Effect.fail(error))
              ),
              Effect.map((value) => [value, 'miss'] as const)
            )
          }),
          Effect.tap((found) => annotateSpan({ 'cache.status': found[1] })),
          Effect.withSpan('cache.get'),
          Effect.provide(context)
        ) as Effect.Effect<readonly [A, CacheStatus], E>,
      bypass: (key) =>
        lookupDirect(key).pipe(
          Effect.map((value) => [value, 'bypass'] as const),
          Effect.tap((found) => annotateSpan({ 'cache.status': found[1] })),
          Effect.withSpan('cache.bypass'),
          Effect.provide(context)
        ) as Effect.Effect<readonly [A, CacheStatus], E>,
      invalidate: (key) => backing.invalidate(key).pipe(Effect.withSpan('cache.invalidate'))
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
      const tag = Context.Service<
        CacheableService<Config['value'], Config['failure']>,
        CacheableService<Config['value'], Config['failure']>
      >()(identifier)
      const layer = Layer.effect(tag, buildService(identifier, options))
      return Object.assign(tag, { layer })
    }
  }
}
