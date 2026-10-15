import { type H3Plugin, HTTPError, type Middleware } from 'h3'
import type { AppConfig } from '../kernel/config/service.ts'
import { type AssetSource, assetRoutes } from '../kernel/http/assets.ts'
import { API_PREFIX, defineRouteGroup } from '../kernel/http/router.ts'
import { unlessDraining } from '../kernel/http/runtime.ts'
import { cacheControl } from '../middleware/cache_control.ts'
import { makeClientResolver } from '../middleware/client_ip.ts'
import {
  makeMemoryRateCheck,
  type RateCheck,
  rateLimit,
  rateLimitMiddleware,
  type RateLimitOptions
} from '../middleware/rate_limit.ts'
import { healthHandler } from '../modules/health/health_handler.ts'
import { homePageHandler } from '../modules/home/home_pages.ts'
import { userPages } from '../modules/user/user_pages.ts'
import { userRoutes } from '../modules/user/user_routes.ts'
import { metricsHandler } from '../observer/metrics_handler.ts'

/** How the groups that do work per request (the API and the pages) count a client. */
const limitOptions = (config: AppConfig, check: RateCheck): RateLimitOptions => ({
  check,
  clientOf: makeClientResolver({
    proxies: config.server.trustProxy,
    platformHeader: config.server.trustedPlatform
  })
})

/** Every module whose routes are served under `/api` (and so described by the API document). */
export const apiModules: readonly H3Plugin[] = [userRoutes]

/**
 * `/api` group: every resource endpoint that answers in the API envelope. Middleware shared by the
 * whole API lives here. Probes and reserved paths stay outside, since load balancers and RFC 8615
 * clients expect them at the origin root.
 */
const apiRoutes = (config: AppConfig, check: RateCheck): H3Plugin =>
  defineRouteGroup({
    prefix: API_PREFIX,
    middleware: [
      // API answers are per caller, so no cache may store them.
      cacheControl({ value: 'no-store', errors: true }),
      ...(config.security.rateLimitEnabled ? [rateLimit(limitOptions(config, check))] : [])
    ],
    routes: (api) => {
      for (const module of apiModules) api.register(module)
    }
  })

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
 * Catch-all for unmatched paths. It throws an `HTTPError` rather than returning h3's internal
 * not-found marker: h3's `onResponse` middleware converts that marker with the default config before
 * the app's `onError` hook sees it, leaking h3's own error body.
 */
const notFoundRoutes: H3Plugin = (app) => {
  // Every method but HEAD: h3 answers a HEAD from the matching GET route only when nothing else
  // matches it first, and a catch-all for HEAD would hide every GET route from health probes.
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
    app.on(method, '/**', () => {
      throw new HTTPError({ status: 404 })
    })
  }
}

/**
 * HTML pages at the origin root, outside the API envelope, under the same rate limit as the API.
 * They are not a group (a group at the root would wrap every later route), so each page carries
 * the limiter as route middleware. Probes, assets and `/.well-known` stay outside it.
 */
const pageRoutes = (config: AppConfig, check: RateCheck): H3Plugin => {
  const middleware: Middleware[] = config.security.rateLimitEnabled
    ? [rateLimitMiddleware(limitOptions(config, check))]
    : []
  return (app) => {
    app.get('/', homePageHandler, { middleware })
    app.register(userPages(middleware))
  }
}

/** Route dependencies beyond the configuration. Both are absent in tests and on Workers. */
export interface RouteOptions {
  /** How API requests are counted against the rate limit; in-process memory when absent. */
  readonly rateCheck?: RateCheck | undefined
  /** Where `/assets/**` is read from; no such route when absent. */
  readonly assets?: AssetSource | undefined
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
    wellKnownRoutes,
    notFoundRoutes
  ]
}
