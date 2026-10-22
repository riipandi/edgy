import { Clock, Effect, Exit, Metric } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { httpRequests } from '#/observer/metrics.ts'

export const requestLog = HttpRouter.use((router) =>
  router.addGlobalMiddleware((effect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const started = yield* Clock.currentTimeMillis
      const outcome = yield* Effect.exit(effect)
      const duration = Math.max(0, (yield* Clock.currentTimeMillis) - started)
      yield* Metric.update(httpRequests, 1)

      const path = new URL(request.originalUrl, 'http://localhost').pathname || '/'
      if (Exit.isFailure(outcome)) {
        yield* Effect.logWarning(`${request.method} ${path} error ${duration}ms`)
        return yield* Effect.failCause(outcome.cause)
      }

      const response = outcome.value
      yield* Effect.logInfo(`${request.method} ${path} ${response.status} ${duration}ms`)
      return response
    })
  )
)
