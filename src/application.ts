import { Effect } from 'effect'
import { RateLimiter } from 'effect/persistence'
import { createApp } from './app.ts'
import { ConfigService } from './kernel/config/service.ts'
import type { AssetSource } from './kernel/http/assets.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'
import { makeSharedRateCheck } from './middleware/rate_limit_shared.ts'

export interface NodeAppOptions {
  /** Where `/assets/**` is read from; absent under `pnpm dev`, where Vite serves them. */
  readonly assets?: AssetSource
  /** Set by `pnpm dev`; relaxes what only development needs. */
  readonly development?: boolean
}

/**
 * The application as Node builds it: the HTTP runtime from the context services, the rate limiter
 * on the store `RATE_LIMIT_STORE` names, and `createApp` over both. Production and the development
 * server share this, so they cannot drift apart. They differ only in who listens and who serves the
 * browser assets.
 */
export const makeNodeApp = (options: NodeAppOptions = {}) =>
  Effect.gen(function* () {
    const config = yield* ConfigService
    const runtime = yield* makeHttpRuntime
    const limiter = yield* RateLimiter.RateLimiter
    const { rateLimitEnabled, rateLimitMax, rateLimitWindow, rateLimitStore } = config.security

    const app = createApp({
      runtime,
      config,
      ...(options.assets === undefined ? {} : { assets: options.assets }),
      ...(options.development === true ? { development: true } : {}),
      // Shared counting only when configured; otherwise the in-process counter serves.
      ...(rateLimitEnabled && rateLimitStore === 'redis'
        ? {
            rateCheck: makeSharedRateCheck({
              limiter,
              max: rateLimitMax,
              window: rateLimitWindow,
              warn: (message, cause) => runtime.runSync(Effect.logWarning(message, cause))
            })
          }
        : {})
    })
    return { app, runtime }
  })
