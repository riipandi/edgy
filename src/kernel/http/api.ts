import { Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { requestTracer } from '#/middleware/tracer.ts'
import { trustProxy } from '#/middleware/trust-proxy.ts'
import { HealthApi, healthHandlers } from '#/modules/health/module.ts'
import { UsersApi, usersHandlers } from '#/modules/user/module.ts'
import { applicationContext, disposeUserRuntime } from '#/modules/user/user_ssr.ts'
import pkg from '../../../package.json' with { type: 'json' }

export const api = HttpApi.make(pkg.name).add(HealthApi, UsersApi).prefix('/api')

export const apiRoutes = HttpApiBuilder.layer(api).pipe(
  Layer.provide(healthHandlers(api)),
  Layer.provide(usersHandlers(api)),
  Layer.provide(rateLimit)
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
