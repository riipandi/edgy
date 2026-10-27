import { Cause, Clock, Effect, Exit, Option } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import { ClientAbort } from 'effect/http/HttpServerError'
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
// metric scrapers polling on a schedule. Quiet paths skip the log line and the
// metric record while they succeed; a failure on a quiet path is still signal
// and is logged like any other failure. Only the Chrome DevTools probe is
// quiet inside `/.well-known/` — the other discovery documents (jwks.json,
// openid-configuration, ACME challenges) are ordinary requests and stay
// logged.
const defaultQuietPaths: ReadonlyArray<QuietPath> = [
  { path: '/.well-known/appspecific/com.chrome.devtools.json', exact: true },
  { path: '/favicon' },
  { path: '/apple-touch-icon' },
  { path: '/assets/' },
  { path: '/_serverFn/' },
  { path: '/__tsd/' },
  { path: '/metrics', exact: true }
]

// A client disconnect surfaces as an interrupt tagged with the ClientAbort
// annotation. The request never produced a response, so it is neither a
// server fault nor a metric sample.
const isClientAbort = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.length > 0 &&
  cause.reasons.every(
    (reason) => reason._tag === 'Interrupt' && reason.annotations.has(ClientAbort.key)
  )

// The shared access record — one metric update plus one data-first log line.
// The Effect middleware and the dev-side Start middleware both call it, so
// dev and prod emit the same shape.
export interface AccessInput {
  readonly method: string
  readonly path: string
  readonly duration: number
  readonly route?: string | undefined
}

export const recordAccess = (
  input: AccessInput & { readonly status: number }
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const duration = Math.max(0, Math.round(input.duration))
    yield* recordRequest(input.method, input.status, routeLabel(input.route), duration)
    yield* Effect.logInfo(`${input.method} ${input.path} ${input.status} ${duration}ms`)
  })

export const recordAccessFailure = (
  input: AccessInput & { readonly cause: Cause.Cause<unknown> }
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const duration = Math.max(0, Math.round(input.duration))
    yield* recordRequest(input.method, 500, routeLabel(input.route), duration)
    yield* Effect.logWarning(`${input.method} ${input.path} error ${duration}ms`, input.cause)
  })

export const isQuietRequestPath = (
  pathname: string,
  quietPaths: ReadonlyArray<QuietPath> = defaultQuietPaths
): boolean => quietPaths.some((quiet) => isQuietPath(pathname, quiet))

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
            const quiet = isQuietRequestPath(path, quietPaths)
            const started = yield* Clock.currentTimeMillis
            const outcome = yield* Effect.exit(effect)
            const duration = Math.max(0, (yield* Clock.currentTimeMillis) - started)

            if (Exit.isSuccess(outcome)) {
              if (quiet) return outcome.value
              const matched = yield* Effect.serviceOption(HttpRouter.RouteContext)
              yield* recordAccess({
                method: request.method,
                path,
                status: outcome.value.status,
                duration,
                route: Option.isSome(matched) ? matched.value.route.path : undefined
              })
              return outcome.value
            }

            if (isClientAbort(outcome.cause)) return yield* Effect.failCause(outcome.cause)

            const matched = yield* Effect.serviceOption(HttpRouter.RouteContext)
            yield* recordAccessFailure({
              method: request.method,
              path,
              duration,
              route: Option.isSome(matched) ? matched.value.route.path : undefined,
              cause: outcome.cause
            })
            return yield* Effect.failCause(outcome.cause)
          })
        )
      )
    )
  )
}
