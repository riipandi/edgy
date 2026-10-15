import { H3 } from 'h3'
import type { AppConfig } from './kernel/config/service.ts'
import { renderHTTPError } from './kernel/http/errors.ts'
import { type HttpRuntime, provideRuntime } from './kernel/http/runtime.ts'
import { bodyLimit } from './middleware/body_limit.ts'
import { cors } from './middleware/cors.ts'
import { loadShedding } from './middleware/load_shedding.ts'
import type { RateCheck } from './middleware/rate_limit.ts'
import { requestId } from './middleware/request_id.ts'
import { securityHeaders } from './middleware/security_headers.ts'
import { httpObserver } from './observer/http_observer.ts'
import { createRoutePlugins, type Platform } from './routes/route.ts'

/** Everything `createApp` needs from the composition root. */
export interface AppOptions {
  readonly runtime: HttpRuntime
  readonly config: AppConfig
  /** How API requests are counted against the rate limit; in-process memory when absent. */
  readonly rateCheck?: RateCheck
  /** Where the app runs; `workers` trusts `CF-Connecting-IP` (with `TRUST_PROXY`). Default `node`. */
  readonly platform?: Platform
}

/**
 * Builds the fully wired application router.
 *
 * Composition is plugin-only, in a fixed order: h3 registers plugins
 * immediately and runs middleware in registration order, so the runtime is
 * attached first, CORS answers a preflight before anything else, the request id
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
    onError: renderHTTPError,
    plugins: [
      provideRuntime(options.runtime),
      cors(options.config.cors),
      requestId(),
      securityHeaders(),
      httpObserver(),
      loadShedding(),
      bodyLimit(options.config.server.bodyLimit),
      ...createRoutePlugins(options.config, options.rateCheck, options.platform)
    ]
  })
