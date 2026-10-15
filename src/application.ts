import { Effect } from 'effect'
import { RateLimiter } from 'effect/persistence'
import { createApp } from './app.ts'
import { ConfigService } from './kernel/config/service.ts'
import type { AssetSource } from './kernel/http/assets.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'
import { makeSharedRateCheck } from './middleware/rate_limit_shared.ts'

/** What the Node server needs besides the services in its context. */
export interface NodeAppOptions {
  /** Where `/assets/**` is read from; absent when Vite serves the assets (`pnpm dev`). */
  readonly assets?: AssetSource
  /** Set by `pnpm dev`; loosens what only development needs (see `createApp`). */
  readonly development?: boolean
}

/**
 * The application as the Node.js runtime builds it: the HTTP runtime captured from the services in
 * the context, the rate limiter on the store `RATE_LIMIT_STORE` names, and `createApp` over both.
 * It is the one place that does so, shared by `serveHttp` (production, and anything that runs the
 * built server) and by the development server (`src/dev.ts`), so the two cannot drift apart: what
 * differs between them is only who listens and who serves the browser assets.
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
      // Shared counting only when asked for; otherwise the in-process counter serves.
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
