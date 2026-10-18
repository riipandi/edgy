import { Context, Effect, Layer } from 'effect'
import { type H3Plugin, HTTPError } from 'h3'
import type { AppConfig } from '../kernel/config/service.ts'
import { allowedMethods } from '../kernel/http/allowed_methods.ts'
import { type AssetSource, assetRoutes } from '../kernel/http/assets.ts'
import { defineRouteGroup } from '../kernel/http/router.ts'
import { rpcRoutes } from '../kernel/http/rpc.ts'
import { unlessDraining, type HttpEnv } from '../kernel/http/runtime.ts'
import { DEFAULT_LIMIT } from '../kernel/pagination.ts'
import { cacheControl } from '../middleware/cache_control.ts'
import { makeMemoryRateCheck, type RateCheck } from '../middleware/rate_limit.ts'
import { healthHandler } from '../modules/health/health_handler.ts'
import { UserRpcs } from '../modules/user/user_rpc.ts'
import { DEFAULT_SORT } from '../modules/user/user_schema.ts'
import { UserService } from '../modules/user/user_service.ts'
import { metricsHandler } from '../observer/metrics_handler.ts'
import { apiRoutes } from './api.ts'
import { pageRoutes } from './web.ts'

/**
 * `/.well-known` group (RFC 8615), at the origin root with its own Cache-Control. The security.txt
 * contact and expiry are placeholders to replace before deploying.
 */
const wellKnownRoutes: H3Plugin = defineRouteGroup({
  prefix: '/.well-known',
  middleware: [cacheControl({ value: 'public, max-age=86400' })],
  routes: (r) => {
    r.get('/security.txt', (event) => {
      event.res.headers.set('content-type', 'text/plain; charset=utf-8')
      return 'Contact: mailto:aris@duck.com\nExpires: 2027-12-31T23:59:59Z\n'
    })
  }
})

/** Root routes outside the API. `/health` returns `503` while draining. `/metrics` exists only when enabled. */
const rootRoutes = (config: AppConfig): H3Plugin => {
  return (app) => {
    app.get('/health', unlessDraining(healthHandler))
    if (config.observability.metricsEnabled) app.get('/metrics', metricsHandler)
  }
}

/**
 * Catch-all for unmatched requests: `405` with `Allow` when the path exists under other methods,
 * `404` otherwise. It throws an `HTTPError` rather than returning h3's internal
 * not-found marker: h3's `onResponse` middleware converts that marker with the default config before
 * the app's `onError` hook sees it, leaking h3's own error body.
 */
const notFoundRoutes: H3Plugin = (app) => {
  // Every method but HEAD: h3 answers a HEAD from the matching GET route only when nothing else
  // matches it first, and a catch-all for HEAD would hide every GET route from health probes.
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
    app.on(method, '/**', (event) => {
      const allow = allowedMethods(app, event.url.pathname)
      if (allow.length === 0) throw new HTTPError({ status: 404 })
      // h3 builds an error response from `errHeaders` only.
      event.res.errHeaders.set('allow', allow.join(', '))
      throw new HTTPError({ status: 405 })
    })
  }
}

/** Route dependencies beyond the configuration. Tests and Workers name what they can provide. */
export interface RouteOptions {
  /** How API requests are counted against the rate limit; in-process memory when absent. */
  readonly rateCheck?: RateCheck | undefined
  /** Where `/assets/**` is read from; no such route when absent. */
  readonly assets?: AssetSource | undefined
  /**
   * The runtime's services context, for the rpc handlers (`/rpc`). Absent in tests that build
   * the app without services — the rpc surface then answers 503, since nothing can serve it.
   */
  readonly services?: Context.Context<HttpEnv> | undefined
}

/** Every route plugin, in registration order. The catch-all must stay last. */
export const createRoutePlugins = (
  config: AppConfig,
  options: RouteOptions = {}
): readonly H3Plugin[] => {
  // One check for both groups, so a client's allowance is shared between pages and API.
  const check =
    options.rateCheck ??
    makeMemoryRateCheck({
      max: config.security.rateLimitMax,
      window: config.security.rateLimitWindow
    })
  return [
    rootRoutes(config),
    apiRoutes(config, check),
    pageRoutes(config, check),
    ...(options.assets === undefined ? [] : [assetRoutes(options.assets)]),
    ...(options.services === undefined
      ? []
      : [
          rpcRoutes(
            UserRpcs,
            UserRpcs.toLayer({
              userList: (payload) =>
                UserService.use((users) =>
                  users
                    .list({
                      limit: payload.limit ?? DEFAULT_LIMIT,
                      sortBy: DEFAULT_SORT.sortBy,
                      sortOrder: 'asc'
                    })
                    .pipe(
                      Effect.map((page) => ({ users: [...page.items] })),
                      Effect.catchTag('DatabaseError', (error) =>
                        Effect.fail({ code: error.code, message: error.clientMessage })
                      )
                    )
                )
            }).pipe(Layer.provide(Layer.succeedContext(options.services)))
          )
        ]),
    wellKnownRoutes,
    notFoundRoutes
  ]
}
