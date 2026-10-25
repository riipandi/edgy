import { Clock, Effect, Exit, Option } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { AppConfig } from '#/kernel/config/config.ts'
import { recordRequest } from '#/observer/metrics.ts'
import { routeLabel } from '#/observer/route-labels.ts'

// A path whose requests carry no signal. `exact: true` matches the pathname
// alone; otherwise it is a prefix, so `/assets` also covers `/assets/app.js`.
export interface QuietPath {
  readonly path: string
  readonly exact?: boolean
}

// A configured path loses its trailing slashes so `exact` matches the same
// pathname whether it was written with one or not.
const normalizePath = (path: string): string => path.replace(/\/+$/u, '') || '/'

const isQuietPath = (pathname: string, quiet: QuietPath): boolean => {
  const path = normalizePath(quiet.path)
  return quiet.exact === true ? pathname === path : pathname.startsWith(path)
}

// Browser and tooling probes, favicons, hashed bundles that never change, and
// metric scrapers polling on a schedule. Quiet paths skip both the log line
// and the metric record.v
const defaultQuietPaths: ReadonlyArray<QuietPath> = [
  { path: '/.well-known/' },
  { path: '/favicon' },
  { path: '/apple-touch-icon' },
  { path: '/assets/' },
  { path: '/api/metrics', exact: true }
]

export const requestLogMiddleware = (options?: {
  readonly quietPaths?: ReadonlyArray<QuietPath>
}) => {
  const quietPaths = options?.quietPaths ?? defaultQuietPaths
  return HttpRouter.use((router) =>
    Effect.map(AppConfig, (config) => config.app.baseUrl).pipe(
      Effect.flatMap((baseUrl) =>
        router.addGlobalMiddleware((effect) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const path = new URL(request.originalUrl, baseUrl).pathname || '/'
            if (quietPaths.some((quiet) => isQuietPath(path, quiet))) return yield* effect
            const started = yield* Clock.currentTimeMillis
            const outcome = yield* Effect.exit(effect)
            const duration = Math.max(0, (yield* Clock.currentTimeMillis) - started)
            // Global middleware wraps the matched route, so RouteContext names
            // the template; requests the router never matched reach nothing here.
            const matched = yield* Effect.serviceOption(HttpRouter.RouteContext)
            const route = routeLabel(Option.isSome(matched) ? matched.value.route.path : undefined)

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
}
