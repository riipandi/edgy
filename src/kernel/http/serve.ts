import { Effect, Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { PrometheusMetrics } from 'effect/observability'
import { AppConfig } from '#/kernel/config/config.ts'
import { gracefulServerLayer } from '#/kernel/graceful.ts'
import { renderPage } from '#/kernel/renderer.ts'
import { corsMiddleware } from '#/middleware/cors.ts'
import { errorResponseMiddleware } from '#/middleware/error-response.ts'
import { requestIdMiddleware } from '#/middleware/request-id.ts'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { securityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { requestTracerMiddleware } from '#/middleware/tracer.ts'
import { trustProxyMiddleware } from '#/middleware/trust-proxy.ts'
import { disposeUserRuntimeEffect } from '#/modules/user/user_ssr.ts'
import { apiRoutes, metricsPath } from './api.ts'

// GET only: the router falls back from HEAD to GET, so registering the catch-all
// for every method would answer HEAD on an API path with this page.
const ssrRouter = HttpRouter.add('GET', '*', renderPage)

export const server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    // The HTTP server's own finalizer runs first, so this log lands after the drain finishes.
    yield* Effect.addFinalizer(() => Effect.logInfo('Server stopped accepting connections'))
    const routes = Layer.mergeAll(
      trustProxyMiddleware,
      requestTracerMiddleware,
      corsMiddleware,
      apiRoutes,
      ssrRouter,
      requestIdMiddleware,
      errorResponseMiddleware,
      requestLogMiddleware(),
      securityHeadersMiddleware,
      Layer.effectDiscard(Effect.addFinalizer(() => disposeUserRuntimeEffect))
    )
    const withMetrics = config.observability.metricsEnabled
      ? routes.pipe(Layer.provide(PrometheusMetrics.layerHttp({ path: metricsPath })))
      : routes
    return HttpRouter.serve(withMetrics).pipe(
      Layer.provide(gracefulServerLayer({ host: config.server.host, port: config.server.port }))
    )
  })
)
