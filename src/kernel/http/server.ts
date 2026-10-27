import { Effect, Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { PrometheusMetrics } from 'effect/observability'
import { AppConfig } from '#/kernel/config/config.ts'
import { gracefulServerLayer } from '#/kernel/graceful.ts'
import { renderPage } from '#/kernel/renderer.ts'
import { disposeUserRuntimeEffect } from '#/kernel/runtime.ts'
import { apiRoutes, metricsPath } from './api.ts'
import { httpStack } from './stack.ts'

// GET only: the router falls back from HEAD to GET, so registering the catch-all
// for every method would answer HEAD on an API path with this page.
const ssrRouter = HttpRouter.add('GET', '*', renderPage)

export const server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    // The HTTP server's own finalizer runs first, so this log lands after the drain finishes.
    yield* Effect.addFinalizer(() => Effect.logInfo('Server stopped accepting connections'))
    const routes = Layer.mergeAll(
      httpStack(apiRoutes, ssrRouter),
      Layer.effectDiscard(Effect.addFinalizer(() => disposeUserRuntimeEffect))
    )
    const withMetrics = config.observability.metricsEnabled
      ? routes.pipe(Layer.provide(PrometheusMetrics.layerHttp({ path: metricsPath })))
      : routes
    // request-log owns the access line; the framework's per-response record
    // would duplicate it and leak causes the middleware already carries.
    return HttpRouter.serve(withMetrics, { disableLogger: true }).pipe(
      Layer.provide(gracefulServerLayer({ host: config.server.host, port: config.server.port }))
    )
  })
)
