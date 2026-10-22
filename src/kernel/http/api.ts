import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { CoreLayer } from '#/layers.ts'
import { HealthModule } from '#/modules/health/module.ts'
import { UserModule, UserRoutes } from '#/modules/user/module.ts'

// Exported for integration tests: compose with a fake UserService
// instead of the real database-backed one.
export const apiRoutes = Layer.mergeAll(HealthModule, UserRoutes)

export const api = Layer.mergeAll(HealthModule, UserModule)

export const apiHandler = () =>
  HttpRouter.toWebHandler(api.pipe(Layer.provide(Layer.merge(HttpServer.layerServices, CoreLayer))))
