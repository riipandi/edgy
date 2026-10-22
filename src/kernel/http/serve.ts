import { NodeHttpServer } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { PrometheusMetrics } from 'effect/observability'
import { createServer } from 'node:http'
import { AppConfig } from '#/kernel/config/config.ts'
import { renderPage } from '#/kernel/renderer.ts'
import { requestId } from '#/middleware/request-id.ts'
import { requestLog } from '#/middleware/request-log.ts'
import { securityHeaders } from '#/middleware/security-headers.ts'
import { requestTracer } from '#/middleware/tracer.ts'
import { trustProxy } from '#/middleware/trust-proxy.ts'
import { disposeUserRuntimeEffect } from '#/modules/user/user_ssr.ts'
import { apiRoutes } from './api.ts'

export const server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    // The HTTP server's own finalizer runs first, so this log lands after the drain finishes.
    yield* Effect.addFinalizer(() => Effect.logInfo('server stopped accepting connections'))
    const routes = Layer.mergeAll(
      trustProxy,
      requestTracer,
      apiRoutes,
      HttpRouter.add('*', '*', renderPage),
      requestId,
      requestLog,
      securityHeaders,
      Layer.effectDiscard(Effect.addFinalizer(() => disposeUserRuntimeEffect))
    )
    const withMetrics = config.observability.metricsEnabled
      ? routes.pipe(Layer.provide(PrometheusMetrics.layerHttp()))
      : routes
    return HttpRouter.serve(withMetrics).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, {
          host: config.server.host,
          port: config.server.port
        })
      )
    )
  })
)
