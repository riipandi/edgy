import { Effect, Layer, Redacted } from 'effect'
import { Persistence, RateLimiter } from 'effect/persistence'
import { DatabaseLayer } from './database/layer.ts'
import { guardBacking } from './kernel/cache/guard.ts'
import { LocalCachePersistence } from './kernel/cache/local.ts'
import { ConfigService } from './kernel/config/service.ts'
import { ServicesLayer } from './services.ts'

/**
 * The Redis/Valkey connection (`REDIS_URL`), shared by everything that uses Redis: this one
 * layer value is built once per `AppLayer`, so the rate limiter and the cache open a single
 * connection between them. Only referenced by a feature configured for `redis`.
 *
 * Loaded lazily: the client library is large, and importing it from the package's barrel would
 * load it on every start (and bundle it into the entry chunk) whether or not Redis is used.
 * It connects when the layer is built, so a wrong `REDIS_URL` stops `serve` at startup instead
 * of failing open on every request.
 */
const RedisLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { security } = yield* ConfigService
    const { layer: redis } = yield* Effect.promise(() => import('@effect/platform-node/NodeRedis'))
    return redis({ url: Redacted.value(security.redisUrl) })
  })
)

/**
 * Effect's `RateLimiter` over the store `RATE_LIMIT_STORE` names. `memory` is provided so
 * the service always exists; the in-process counter in `rate_limit.ts` is what serves
 * requests then, and it is all a disabled limiter gets: Redis is not contacted unless the
 * limiter is on.
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
 * `Persistence` for the read-through cache, by `CACHE_STORE`. `memory` (and a disabled cache)
 * get the in-process one, which keeps nothing outside the cache's own memory; `redis` is
 * guarded so an unreachable Redis costs entries, not requests (`guardBacking`).
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
 * Data-access stack for Node.js: the configured database driver, the rate limiter's
 * store, then every module's services on top. Built once per command
 * (`Command.provide`), while `CoreLayer` is provided once at the entry point. The Workers
 * entry composes `ServicesLayer` with D1 itself, so none of the Node-only pieces
 * (`node:sqlite`, Redis) reach it.
 */
export const AppLayer = ServicesLayer.pipe(
  Layer.provide(CachePersistenceLayer),
  Layer.provideMerge(DatabaseLayer),
  Layer.provideMerge(RateLimiterLayer)
)
