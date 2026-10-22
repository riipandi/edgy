import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { CoreLayer } from '#/layers.ts'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { health } from '#/modules/health/health_handler.ts'
import { UserModule, UserRoutes } from '#/modules/user/module.ts'

// Rate limit stays scoped to these route layers; request id and request log
// live on the outer server router (serve.ts) for every route.
const healthRoute = HttpRouter.add('GET', '/api/health', health).pipe(Layer.provide(rateLimit))

// Exported for integration tests: compose with a fake UserService
// instead of the real database-backed one.
export const apiRoutes = Layer.mergeAll(healthRoute, UserRoutes)

export const api = Layer.mergeAll(healthRoute, UserModule)

export const apiHandler = () =>
  HttpRouter.toWebHandler(api.pipe(Layer.provide(Layer.merge(HttpServer.layerServices, CoreLayer))))
