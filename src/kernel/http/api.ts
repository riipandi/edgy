import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { HealthModule } from '#/modules/health/module.ts'
import { UserRoutes } from '#/modules/user/module.ts'
import { applicationContext, disposeUserRuntime } from '#/modules/user/user_ssr.ts'

// Exported for integration tests: compose with a fake UserService
// instead of the real database-backed one.
export const apiRoutes = Layer.mergeAll(HealthModule, UserRoutes)

export const api = Layer.mergeAll(HealthModule, UserRoutes)

export const apiHandler = async () => {
  const context = await applicationContext()
  const handler = HttpRouter.toWebHandler(
    api.pipe(Layer.provide(Layer.succeedContext(context)), Layer.provide(HttpServer.layerServices))
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
