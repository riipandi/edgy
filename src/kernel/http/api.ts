import { Effect, Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiScalar from 'effect/http-api/HttpApiScalar'
import * as OpenApi from 'effect/http-api/OpenApi'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { AppConfig } from '#/kernel/config/config.ts'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { requestId } from '#/middleware/request-id.ts'
import { requestLog } from '#/middleware/request-log.ts'
import { securityHeaders } from '#/middleware/security-headers.ts'
import { requestTracer } from '#/middleware/tracer.ts'
import { trustProxy } from '#/middleware/trust-proxy.ts'
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
      Layer.provide(rateLimit)
    )
    return config.docs.enabled
      ? Layer.mergeAll(routes, HttpApiScalar.layer(api, { path: apiDocsPath }))
      : routes
  })
)

export const apiHandler = async () => {
  const context = await applicationContext()
  const handler = HttpRouter.toWebHandler(
    Layer.mergeAll(
      trustProxy,
      requestId,
      requestLog,
      securityHeaders,
      apiRoutes,
      requestTracer
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
