import { type H3Plugin, HTTPError } from 'h3'
import type { AppConfig } from '../kernel/config/service.ts'
import { defineRouteGroup } from '../kernel/http/router.ts'
import { unlessDraining } from '../kernel/http/runtime.ts'
import { cacheControl } from '../middleware/cache_control.ts'
import { makeMemoryRateCheck, type RateCheck, rateLimit } from '../middleware/rate_limit.ts'
import { healthHandler } from '../modules/health/health_handler.ts'
import { userRoutes } from '../modules/user/user_routes.ts'
import { metricsHandler } from '../observer/metrics_handler.ts'

/**
 * `/api` group: every resource endpoint that answers in the API envelope.
 *
 * Resource groups register here, not on the app, so the prefix is written once
 * and middleware shared by the whole API (rate limiting today, auth later) has
 * one place to go. Probes and reserved paths stay outside it on purpose: load
 * balancers and RFC 8615 clients expect them at the origin root.
 *
 * A new module's routes are registered in this callback.
 */
const apiRoutes = (config: AppConfig, check: RateCheck): H3Plugin =>
  defineRouteGroup({
    prefix: '/api',
    middleware: [
      // Answers are per caller and per moment: no cache, shared or private, may keep one.
      cacheControl({ value: 'no-store', errors: true }),
      ...(config.security.rateLimitEnabled
        ? [rateLimit({ check, trustProxy: config.server.trustProxy })]
        : [])
    ],
    routes: (api) => {
      api.register(userRoutes)
    }
  })

/**
 * `/.well-known` group.
 *
 * Reserved-path endpoints (RFC 8615) that must sit at the origin root. The
 * group carries its own middleware — `Cache-Control` here — without leaking it
 * to any other route.
 *
 * `security.txt` is plain text by definition (RFC 9116). The contact and expiry
 * are placeholders: replace them before deploying.
 */
const wellKnownRoutes: H3Plugin = defineRouteGroup({
  prefix: '/.well-known',
  middleware: [cacheControl({ value: 'public, max-age=86400' })],
  routes: (r) => {
    r.get('/security.txt', (event) => {
      event.res.headers.set('content-type', 'text/plain; charset=utf-8')
      return 'Contact: mailto:security@example.com\nExpires: 2027-12-31T23:59:59Z\n'
    })
  }
})

/**
 * Root routes that do not belong to the API.
 *
 * `/` is a liveness check for humans and proxies, so it answers plain text, not
 * the envelope. `/health` is the readiness probe: it keeps its root path and
 * turns `503` while the server is shutting down. `/metrics` exists only when
 * enabled.
 */
const rootRoutes = (config: AppConfig): H3Plugin => {
  return (app) => {
    app.get('/', (event) => {
      event.res.headers.set('content-type', 'text/plain; charset=utf-8')
      return 'All is well'
    })
    app.get('/health', unlessDraining(healthHandler))
    if (config.observability.metricsEnabled) app.get('/metrics', metricsHandler)
  }
}

/**
 * Catch-all for paths no route claims. The lowest-priority pattern in the trie,
 * so it only answers what nothing else matched.
 *
 * It throws instead of letting h3 return its internal not-found marker: h3's
 * `onResponse` middleware (used by the observer) converts that marker with the
 * default config before the app's `onError` hook can see it, which would leak
 * h3's own error body. A thrown `HTTPError` reaches the hook.
 */
const notFoundRoutes: H3Plugin = (app) => {
  app.all('/**', () => {
    throw new HTTPError({ status: 404 })
  })
}

/** Every route plugin, in registration order. The catch-all must stay last. */
export const createRoutePlugins = (
  config: AppConfig,
  rateCheck?: RateCheck
): readonly H3Plugin[] => [
  rootRoutes(config),
  apiRoutes(
    config,
    rateCheck ??
      makeMemoryRateCheck({
        max: config.security.rateLimitMax,
        window: config.security.rateLimitWindow
      })
  ),
  wellKnownRoutes,
  notFoundRoutes
]
