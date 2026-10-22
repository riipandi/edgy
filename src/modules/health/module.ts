import { Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { health } from './health_handler.ts'

export const HealthModule = HttpRouter.addAll([HttpRouter.route('GET', '/health', health)], {
  prefix: '/api'
}).pipe(Layer.provide(rateLimit))
