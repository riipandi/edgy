import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { DatabaseLayer } from '#/database/layer.ts'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { findUser, listUsers } from './user_handler.ts'
import { UserRepoLayer } from './user_repo.ts'
import { UserServiceLayer } from './user_service.ts'

export const UserRoutes = HttpRouter.addAll(
  [HttpRouter.route('GET', '/', listUsers), HttpRouter.route('GET', '/:id', findUser)],
  { prefix: '/api/users' }
).pipe(Layer.provide(rateLimit))

export const UserModule = UserRoutes.pipe(
  HttpRouter.provideRequest(UserServiceLayer),
  Layer.provide(UserRepoLayer),
  Layer.provide(DatabaseLayer)
)
