import { Clock, Effect, Exit } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig } from '#/kernel/config/config.ts'
import { recordRequest, statusClass } from '#/observer/metrics.ts'

export const requestLogMiddleware = HttpRouter.use((router) =>
  Effect.map(AppConfig, (config) => config.app.baseUrl).pipe(
    Effect.flatMap((baseUrl) =>
      router.addGlobalMiddleware((effect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const started = yield* Clock.currentTimeMillis
          const outcome = yield* Effect.exit(effect)
          const duration = Math.max(0, (yield* Clock.currentTimeMillis) - started)

          const path = new URL(request.originalUrl, baseUrl).pathname || '/'
          if (Exit.isFailure(outcome)) {
            yield* recordRequest(request.method, statusClass(500), duration)
            yield* Effect.logWarning(`${request.method} ${path} error ${duration}ms`)
            return yield* Effect.failCause(outcome.cause)
          }

          const response = outcome.value
          yield* recordRequest(request.method, statusClass(response.status), duration)
          yield* Effect.logInfo(`${request.method} ${path} ${response.status} ${duration}ms`)
          return response
        })
      )
    )
  )
)
