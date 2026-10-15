import { H3 } from 'h3'
import type { CorsConfig } from './kernel/config.ts'
import { renderH3Error } from './kernel/http/h3_error.ts'
import { type HttpRuntime, provideRuntime } from './kernel/http/runtime.ts'
import { bodyLimit } from './middleware/body_limit.ts'
import { cors } from './middleware/cors.ts'
import { requestId } from './middleware/request_id.ts'
import { httpObserver } from './observer/http_observer.ts'
import { routePlugins } from './routes/route.ts'

/** Everything `createApp` needs from the composition root. */
export interface AppOptions {
  readonly runtime: HttpRuntime
  /** Largest accepted request body, in bytes. */
  readonly bodyLimit: number
  readonly cors: CorsConfig
}

/**
 * Builds the fully wired application router.
 *
 * Composition is plugin-only, in a fixed order: h3 registers plugins
 * immediately and runs middleware in registration order, so the runtime is
 * attached first, CORS answers a preflight before anything else, the request id
 * is assigned next, the observer reads it, and the body limit applies last
 * before the routes (a rejected body is still logged and carries the id). Route
 * groups mount after the globals, which guarantees the globals wrap them.
 *
 * Taking its dependencies as arguments (instead of reading a global runtime)
 * lets a test build the app against any `HttpRuntime`.
 */
export const createApp = (options: AppOptions): H3 =>
  new H3({
    onError: renderH3Error,
    plugins: [
      provideRuntime(options.runtime),
      cors(options.cors),
      requestId(),
      httpObserver(),
      bodyLimit(options.bodyLimit),
      ...routePlugins
    ]
  })
