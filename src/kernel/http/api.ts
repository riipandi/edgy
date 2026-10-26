import { Context, Effect, Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiScalar from 'effect/http-api/HttpApiScalar'
import * as OpenApi from 'effect/http-api/OpenApi'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { PrometheusMetrics } from 'effect/observability'
import { AppConfig } from '#/kernel/config/config.ts'
import { healthHandlers, HealthApi } from '#/kernel/healthcheck.ts'
import { applicationContext, disposeUserRuntime } from '#/kernel/runtime.ts'
import { corsMiddleware } from '#/middleware/cors.ts'
import { errorResponseMiddleware } from '#/middleware/error-response.ts'
import { rateLimitMiddleware } from '#/middleware/rate-limit.ts'
import { requestIdMiddleware } from '#/middleware/request-id.ts'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { docsSecurityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { securityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { requestTracerMiddleware } from '#/middleware/tracer.ts'
import { trustProxyMiddleware } from '#/middleware/trust-proxy.ts'
import { UsersApi, usersHandlers } from '#/modules/identity/module.ts'
import { LoggerLayer } from '#/observer/logger.ts'
import pkg from '../../../package.json' with { type: 'json' }

export const apiDocsPath = '/api-docs'
export const openApiPath = '/api/openapi.json'

// The Prometheus scrape endpoint; the serve command and the dev composition
// mount it through PrometheusMetrics.layerHttp({ path: metricsPath }).
export const metricsPath = '/metrics'

export const api = HttpApi.make(pkg.name)
  .add(HealthApi, UsersApi)
  .annotate(OpenApi.Title, pkg.name)
  .annotate(OpenApi.Version, pkg.version)
  .prefix('/api')

// The fallback answers every router-owned path the contract does not define —
// including the wrong method on a known path — so an API typo is a JSON 404
// in serve and in dev instead of the SSR page or an empty body. Static routes
// keep find-my-way priority over the wildcard.
const apiFallbacks = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add(
      '*',
      '/api/*',
      Effect.succeed(HttpServerResponse.jsonUnsafe({ _tag: 'NotFound' }, { status: 404 }))
    )
  })
)

export const apiRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const openapiPath = config.docs.enabled ? openApiPath : undefined
    const routes = HttpApiBuilder.layer(api, { openapiPath }).pipe(
      Layer.provide(healthHandlers(api)),
      Layer.provide(usersHandlers(api)),
      Layer.provide(rateLimitMiddleware({ excludePaths: [{ path: '/api/health', exact: true }] }))
    )
    const withFallbacks = Layer.mergeAll(routes, apiFallbacks)
    return config.docs.enabled
      ? Layer.mergeAll(
          withFallbacks,
          HttpApiScalar.layer(api, { path: apiDocsPath }).pipe(
            Layer.provide(docsSecurityHeadersMiddleware)
          )
        )
      : withFallbacks
  })
)

export const apiHandler = async () => {
  const context = await applicationContext()
  const config = Context.get(context, AppConfig)
  // The dev composition mirrors the serve command's metrics gate so the
  // forwarded scrape endpoint exists here too.
  const metrics = config.observability.metricsEnabled
    ? PrometheusMetrics.layerHttp({ path: metricsPath })
    : Layer.empty
  const handler = HttpRouter.toWebHandler(
    // The composition's logger rides the outermost merge: fiber-level log
    // references only reach the request fibers from an ambient layer around
    // the whole program, the same rule the test compositions follow.
    Layer.mergeAll(
      Layer.mergeAll(
        trustProxyMiddleware,
        requestIdMiddleware,
        errorResponseMiddleware,
        requestLogMiddleware(),
        corsMiddleware,
        securityHeadersMiddleware,
        apiRoutes,
        metrics,
        requestTracerMiddleware
      ).pipe(Layer.provide(Layer.succeedContext(context)), Layer.provide(HttpServer.layerServices)),
      LoggerLayer.pipe(Layer.provide(Layer.succeedContext(context)))
    )
  )
  return {
    ...handler,
    dispose: async () => {
      try {
        await handler.dispose()
      } finally {
        await disposeUserRuntime()
      }
    }
  }
}
