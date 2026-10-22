import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { findUser, listUsers } from './user_handler.ts'

export const UserRoutes = HttpRouter.addAll(
  [HttpRouter.route('GET', '/', listUsers), HttpRouter.route('GET', '/:id', findUser)],
  { prefix: '/api/users' }
).pipe(Layer.provide(rateLimit))
