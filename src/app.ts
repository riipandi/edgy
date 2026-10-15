import { H3 } from 'h3'
import type { AppConfig } from './kernel/config/service.ts'
import type { AssetSource } from './kernel/http/assets.ts'
import type { DevServer } from './kernel/http/dev_server.ts'
import { makeErrorHandler } from './kernel/http/error_page.ts'
import { type HttpRuntime, provideRuntime } from './kernel/http/runtime.ts'
import { bodyLimit } from './middleware/body_limit.ts'
import { locationHeaders } from './middleware/client_location.ts'
import { cors } from './middleware/cors.ts'
import { devAssets } from './middleware/dev_assets.ts'
import { loadShedding } from './middleware/load_shedding.ts'
import type { RateCheck } from './middleware/rate_limit.ts'
import { requestId } from './middleware/request_id.ts'
import { securityHeaders } from './middleware/security_headers.ts'
import { httpObserver } from './observer/http_observer.ts'
import { createRoutePlugins } from './routes/route.ts'

/** Everything `createApp` needs from the composition root. */
export interface AppOptions {
  readonly runtime: HttpRuntime
  readonly config: AppConfig
  /** How API requests are counted against the rate limit; in-process memory when absent. */
  readonly rateCheck?: RateCheck
  /** Where the built browser assets are read from (`/assets/**`); absent on Workers and in development. */
  readonly assets?: AssetSource
  /** The Vite dev server, only under `pnpm dev`; it serves the assets from the source tree instead. */
  readonly dev?: DevServer
}

/**
 * Builds the fully wired application router.
 *
 * Composition is plugin-only, in a fixed order: h3 registers plugins
 * immediately and runs middleware in registration order, so the Vite dev server (development
 * only) answers its own requests before anything counts or logs them, the runtime is
 * attached next, CORS answers a preflight before anything else, the request id
 * is assigned next, security headers follow so every later response (errors
 * included) carries them, the observer reads the id, the overload guard refuses excess
 * requests before anything else costs work, and the body limit applies
 * last before the routes (a rejected body is still logged and carries the id). Route
 * groups mount after the globals, which guarantees the globals wrap them.
 *
 * Taking its dependencies as arguments (instead of reading a global runtime)
 * lets a test build the app against any `HttpRuntime`.
 */
export const createApp = (options: AppOptions): H3 =>
  new H3({
    onError: makeErrorHandler(() => import('../app/pages/error.marko')),
    plugins: [
      ...(options.dev === undefined ? [] : [devAssets(options.dev)]),
      provideRuntime(options.runtime),
      cors(options.config.cors),
      requestId(),
      ...(options.config.server.cloudflareLocationHeaders
        ? [locationHeaders({ platformHeader: options.config.server.trustedPlatform })]
        : []),
      securityHeaders(),
      httpObserver(),
      loadShedding(),
      bodyLimit(options.config.server.bodyLimit),
      ...createRoutePlugins(options.config, {
        rateCheck: options.rateCheck,
        assets: options.assets
      })
    ]
  })
