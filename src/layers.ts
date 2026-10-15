import { Effect, Layer, Redacted } from 'effect'
import { Persistence, RateLimiter } from 'effect/persistence'
import { DatabaseLayer } from './database/layer.ts'
import { guardBacking } from './kernel/cache/guard.ts'
import { LocalCachePersistence } from './kernel/cache/local.ts'
import { ConfigService } from './kernel/config/service.ts'
import { ServicesLayer } from './services.ts'

/**
 * Redis connection (`REDIS_URL`), built once per `AppLayer` so the rate limiter and the cache share
 * it. Imported lazily because the client is large and would otherwise load on every start. It
 * connects when built, so a wrong `REDIS_URL` stops `serve` at startup instead of failing requests.
 */
const RedisLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { security } = yield* ConfigService
    const { layer: redis } = yield* Effect.promise(() => import('@effect/platform-node/NodeRedis'))
    return redis({ url: Redacted.value(security.redisUrl) })
  })
)

/**
 * Effect's `RateLimiter` over the store `RATE_LIMIT_STORE` names. The memory store is always
 * provided so the service exists. Redis is contacted only when the limiter is enabled.
 */
const RateLimiterLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { security } = yield* ConfigService
    if (security.rateLimitEnabled && security.rateLimitStore === 'cloudflare') {
      return yield* Effect.die(
        new Error('RATE_LIMIT_STORE=cloudflare needs the Workers runtime (use memory or redis)')
      )
    }
    if (!security.rateLimitEnabled || security.rateLimitStore !== 'redis') {
      return RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))
    }
    return RateLimiter.layer.pipe(
      Layer.provide(RateLimiter.layerStoreRedis().pipe(Layer.provide(RedisLayer)))
    )
  })
)

/**
 * `Persistence` for the read-through cache, by `CACHE_STORE`. Redis is guarded, so an unreachable
 * server costs cache entries, not requests.
 */
const CachePersistenceLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { cache } = yield* ConfigService
    if (cache.enabled && cache.store === 'cloudflare') {
      return yield* Effect.die(
        new Error('CACHE_STORE=cloudflare needs the Workers runtime (use memory or redis)')
      )
    }
    if (!cache.enabled || cache.store !== 'redis') return LocalCachePersistence
    return Persistence.layer.pipe(
      Layer.provide(guardBacking(Persistence.layerBackingRedis.pipe(Layer.provide(RedisLayer))))
    )
  })
)

/**
 * Data-access stack for Node: the database driver, the rate limiter's store, then the module
 * services. Node-only pieces (`node:sqlite`, Redis) stay out of the Workers entry, which composes
 * `ServicesLayer` with D1 itself.
 */
export const AppLayer = ServicesLayer.pipe(
  Layer.provide(CachePersistenceLayer),
  Layer.provideMerge(DatabaseLayer),
  Layer.provideMerge(RateLimiterLayer)
)
