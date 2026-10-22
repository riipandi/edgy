import { Effect, Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiSwagger from 'effect/http-api/HttpApiSwagger'
import * as OpenApi from 'effect/http-api/OpenApi'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { AppConfig } from '#/kernel/config/config.ts'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { requestTracer } from '#/middleware/tracer.ts'
import { trustProxy } from '#/middleware/trust-proxy.ts'
import { HealthApi, healthHandlers } from '#/modules/health/module.ts'
import { UsersApi, usersHandlers } from '#/modules/user/module.ts'
import { applicationContext, disposeUserRuntime } from '#/modules/user/user_ssr.ts'
import pkg from '../../../package.json' with { type: 'json' }

export const api = HttpApi.make(pkg.name)
  .add(HealthApi, UsersApi)
  .annotate(OpenApi.Title, pkg.name)
  .annotate(OpenApi.Version, pkg.version)
  .prefix('/api')

export const apiRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const openapiPath = config.docs.enabled ? ('/docs/openapi.json' as const) : undefined
    const routes = HttpApiBuilder.layer(api, { openapiPath }).pipe(
      Layer.provide(healthHandlers(api)),
      Layer.provide(usersHandlers(api)),
      Layer.provide(rateLimit)
    )
    return config.docs.enabled ? Layer.mergeAll(routes, HttpApiSwagger.layer(api)) : routes
  })
)

export const apiHandler = async () => {
  const context = await applicationContext()
  const handler = HttpRouter.toWebHandler(
    Layer.mergeAll(trustProxy, apiRoutes, requestTracer).pipe(
      Layer.provide(Layer.succeedContext(context)),
      Layer.provide(HttpServer.layerServices)
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
