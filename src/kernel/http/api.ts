import { Effect, Layer } from 'effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import { rateLimit } from '#/middleware/rate-limit.ts'
import { requestTracer } from '#/middleware/tracer.ts'
import { trustProxy } from '#/middleware/trust-proxy.ts'
import { HealthService } from '#/modules/health/health_service.ts'
import { HealthApi } from '#/modules/health/module.ts'
import { UsersApi } from '#/modules/user/module.ts'
import { parseUserId } from '#/modules/user/user_schema.ts'
import { UserService } from '#/modules/user/user_service.ts'
import { applicationContext, disposeUserRuntime } from '#/modules/user/user_ssr.ts'
import pkg from '../../../package.json' with { type: 'json' }

export const api = HttpApi.make(pkg.name).add(HealthApi, UsersApi).prefix('/api')

const healthLive = HttpApiBuilder.group(api, 'health', (handlers) =>
  handlers.handle('health', () =>
    Effect.gen(function* () {
      const service = yield* HealthService
      yield* service.check
      return { status: 'ok' as const }
    }).pipe(
      Effect.catchTag('DatabaseError', () => Effect.fail(new HttpApiError.ServiceUnavailable()))
    )
  )
)

const usersLive = HttpApiBuilder.group(api, 'users', (handlers) =>
  handlers
    .handle('listUsers', () =>
      Effect.flatMap(UserService, (service) =>
        service
          .list()
          .pipe(
            Effect.catchTag('UserRepositoryError', () =>
              Effect.fail(new HttpApiError.ServiceUnavailable())
            )
          )
      )
    )
    .handle('getUser', ({ params }) =>
      Effect.flatMap(UserService, (service) =>
        service.find(parseUserId(params.id)).pipe(
          Effect.flatMap((user) =>
            user === undefined ? Effect.fail(new HttpApiError.NotFound()) : Effect.succeed(user)
          ),
          Effect.catchTag('UserRepositoryError', () =>
            Effect.fail(new HttpApiError.ServiceUnavailable())
          )
        )
      )
    )
)

export const apiRoutes = HttpApiBuilder.layer(api).pipe(
  Layer.provide(healthLive),
  Layer.provide(usersLive),
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
