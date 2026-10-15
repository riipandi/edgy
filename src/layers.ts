import { Effect, Layer, Redacted } from 'effect'
import { RateLimiter } from 'effect/persistence'
import { DatabaseLayer } from './database/layer.ts'
import { ConfigService } from './kernel/config/service.ts'
import { ServicesLayer } from './services.ts'

/**
 * Effect's `RateLimiter` over the store `RATE_LIMIT_STORE` names. `memory` is provided so
 * the service always exists; the in-process counter in `rate_limit.ts` is what serves
 * requests then. `redis` connects when the layer is built, so a wrong `REDIS_URL` stops
 * `serve` at startup instead of failing open on every request.
 */
const RateLimiterLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { security } = yield* ConfigService
    if (security.rateLimitStore !== 'redis') {
      return RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))
    }

    // Loaded only now, and only for Redis: the client library is large, and importing it
    // from the package's barrel would load it on every start (and bundle it into the
    // entry chunk) whether or not Redis is used.
    const { layer: redis } = yield* Effect.promise(() => import('@effect/platform-node/NodeRedis'))
    return RateLimiter.layer.pipe(
      Layer.provide(
        RateLimiter.layerStoreRedis().pipe(
          Layer.provide(redis({ url: Redacted.value(security.redisUrl) }))
        )
      )
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
  Layer.provideMerge(DatabaseLayer),
  Layer.provideMerge(RateLimiterLayer)
)
