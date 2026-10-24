import { Effect, Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiScalar from 'effect/http-api/HttpApiScalar'
import * as OpenApi from 'effect/http-api/OpenApi'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { AppConfig } from '#/kernel/config/config.ts'
import { corsMiddleware } from '#/middleware/cors.ts'
import { rateLimitMiddleware } from '#/middleware/rate-limit.ts'
import { requestIdMiddleware } from '#/middleware/request-id.ts'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { docsSecurityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { securityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { requestTracerMiddleware } from '#/middleware/tracer.ts'
import { trustProxyMiddleware } from '#/middleware/trust-proxy.ts'
import { HealthApi, healthHandlers } from '#/modules/health/module.ts'
import { UsersApi, usersHandlers } from '#/modules/user/module.ts'
import { applicationContext, disposeUserRuntime } from '#/modules/user/user_ssr.ts'
import pkg from '../../../package.json' with { type: 'json' }

export const apiDocsPath = '/api-docs'
export const openApiPath = '/api/openapi.json'

export const api = HttpApi.make(pkg.name)
  .add(HealthApi, UsersApi)
  .annotate(OpenApi.Title, pkg.name)
  .annotate(OpenApi.Version, pkg.version)
  .prefix('/api')

export const apiRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const openapiPath = config.docs.enabled ? openApiPath : undefined
    const routes = HttpApiBuilder.layer(api, { openapiPath }).pipe(
      Layer.provide(healthHandlers(api)),
      Layer.provide(usersHandlers(api)),
      Layer.provide(rateLimitMiddleware)
    )
    return config.docs.enabled
      ? Layer.mergeAll(
          routes,
          HttpApiScalar.layer(api, { path: apiDocsPath }).pipe(
            Layer.provide(docsSecurityHeadersMiddleware)
          )
        )
      : routes
  })
)

export const apiHandler = async () => {
  const context = await applicationContext()
  const handler = HttpRouter.toWebHandler(
    Layer.mergeAll(
      trustProxyMiddleware,
      requestIdMiddleware,
      requestLogMiddleware,
      corsMiddleware,
      securityHeadersMiddleware,
      apiRoutes,
      requestTracerMiddleware
    ).pipe(Layer.provide(Layer.succeedContext(context)), Layer.provide(HttpServer.layerServices))
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
