import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { layer as databaseLayer } from '../../database/layer.ts'
import { rateLimit } from '../../middleware/rate-limit.ts'
import { health } from '../../modules/health/health_handler.ts'
import { findUser, listUsers } from '../../modules/user/user_handler.ts'
import { layer as userRepoLayer } from '../../modules/user/user_repo.ts'
import { layer as userServiceLayer } from '../../modules/user/user_service.ts'
import { layer as loggerLayer } from '../../observer/logger.ts'
import { layer as configLayer } from '../config/app-config.ts'

// Rate limit stays scoped to these route layers; request id and request log
// live on the outer server router (serve.ts) for every route.
const routes = Layer.mergeAll(
  HttpRouter.add('GET', '/api/health', health).pipe(Layer.provide(rateLimit)),
  HttpRouter.add('GET', '/api/users', listUsers).pipe(Layer.provide(rateLimit)),
  HttpRouter.add('GET', '/api/users/:id', findUser).pipe(Layer.provide(rateLimit))
)

export const api = routes.pipe(
  HttpRouter.provideRequest(userServiceLayer),
  Layer.provide(userRepoLayer),
  Layer.provide(databaseLayer),
  Layer.provide(loggerLayer),
  Layer.provide(configLayer)
)

export const apiHandler = () =>
  HttpRouter.toWebHandler(api.pipe(Layer.provide(HttpServer.layerServices)))
