import { Clock, Effect, Exit, Option } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig } from '#/kernel/config/config.ts'
import { recordRequest } from '#/observer/metrics.ts'
import { routeLabel } from '#/observer/route-labels.ts'

export const requestLogMiddleware = HttpRouter.use((router) =>
  Effect.map(AppConfig, (config) => config.app.baseUrl).pipe(
    Effect.flatMap((baseUrl) =>
      router.addGlobalMiddleware((effect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const started = yield* Clock.currentTimeMillis
          const outcome = yield* Effect.exit(effect)
          const duration = Math.max(0, (yield* Clock.currentTimeMillis) - started)
          // Global middleware wraps the matched route, so RouteContext names
          // the template; requests the router never matched reach nothing here.
          const matched = yield* Effect.serviceOption(HttpRouter.RouteContext)
          const route = routeLabel(Option.isSome(matched) ? matched.value.route.path : undefined)

          const path = new URL(request.originalUrl, baseUrl).pathname || '/'
          if (Exit.isFailure(outcome)) {
            yield* recordRequest(request.method, 500, route, duration)
            yield* Effect.logWarning(`${request.method} ${path} error ${duration}ms`)
            return yield* Effect.failCause(outcome.cause)
          }

          const response = outcome.value
          yield* recordRequest(request.method, response.status, route, duration)
          yield* Effect.logInfo(`${request.method} ${path} ${response.status} ${duration}ms`)
          return response
        })
      )
    )
  )
)
