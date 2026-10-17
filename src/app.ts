import { H3 } from 'h3'
import type { AppConfig } from './kernel/config/service.ts'
import type { AssetSource } from './kernel/http/assets.ts'
import { makeErrorHandler } from './kernel/http/error_page.ts'
import { type HttpRuntime, provideRuntime } from './kernel/http/runtime.ts'
import { bodyLimit } from './middleware/body_limit.ts'
import { locationHeaders } from './middleware/client_location.ts'
import { cors } from './middleware/cors.ts'
import { developmentMode } from './middleware/development.ts'
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
  /** Development mode: the HTML policy allows what Vite needs (runtime styles, hot-reload socket). */
  readonly development?: boolean
}

/**
 * Builds the application router. Composition is plugin-only and runs in a fixed order, because h3
 * runs middleware in registration order: the runtime is attached first, CORS answers preflights
 * before anything else, and the request id is assigned next. Security headers follow, so every later
 * response, errors included, carries them. The observer reads the id, the overload guard refuses
 * excess requests before they cost work, and the body limit applies last, so a rejected body is
 * still logged with the id. Route groups mount after the globals, so the globals wrap them.
 *
 * Dependencies are arguments, not a global runtime, so a test can build the app against any `HttpRuntime`.
 */
export const createApp = (options: AppOptions): H3 =>
  new H3({
    onError: makeErrorHandler(() => import('../web/pages/error/page.tsx')),
    plugins: [
      provideRuntime(options.runtime),
      ...(options.development === true ? [developmentMode()] : []),
      cors(options.config.cors),
      requestId(),
      ...(options.config.server.cloudflareLocationHeaders
        ? [
            locationHeaders({
              platformHeader: options.config.server.trustedPlatform,
              proxies: options.config.server.trustProxy
            })
          ]
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
