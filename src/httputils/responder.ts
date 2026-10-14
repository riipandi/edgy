import { Cause, Effect, Exit, Metric, Option } from 'effect'
import type { H3Event } from 'h3'
import { AppRuntime, type AppEnv } from '../runtime.ts'
import type { AppError, ValidationIssue } from './errors.ts'

/**
 * Typed JSON body shapes for error responses (mapped from error tags below).
 * All handler return types are concrete objects, never `unknown`.
 */
export interface ErrorResponse {
  readonly error: string
  readonly id?: number
}

export interface ValidationErrorResponse {
  readonly error: 'Validation failed'
  readonly issues: ReadonlyArray<ValidationIssue>
}

// --- Telemetry ---

/** Total HTTP requests handled. */
const httpRequests = Metric.counter('http_requests_total', {
  description: 'Total number of HTTP requests handled',
  incremental: true
})

/** Request latency in milliseconds. */
const httpDuration = Metric.timer('http_request_duration_ms', {
  description: 'HTTP request latency in milliseconds',
  boundaries: [5, 10, 25, 50, 100, 250, 500, 1000]
})

/**
 * Bridge Effect -> HTTP: run the program on the app runtime and map typed
 * errors to response status codes. Failures are narrowed via `_tag`, so every
 * branch returns a concrete JSON body.
 *
 * The handler program is wrapped in a tracing span (method + path attributes)
 * and its latency is recorded in the request timer.
 */
export const runEffect = <A, E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<A, E, AppEnv>
): Promise<A | ValidationErrorResponse | ErrorResponse> =>
  AppRuntime.runPromiseExit(
    effect.pipe(
      Effect.tap(() => Metric.update(httpRequests, 1)),
      Effect.timed,
      Effect.tap(([duration]) => Metric.update(httpDuration, duration)),
      Effect.map(([, result]) => result),
      Effect.withSpan(`${event.req.method} ${event.url.pathname}`)
    )
  ).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value

    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isSome(failure)) {
      switch (failure.value._tag) {
        case 'ValidationError': {
          event.res.status = 400
          return {
            error: 'Validation failed',
            issues: failure.value.issues
          } satisfies ValidationErrorResponse
        }
        case 'NotFound': {
          event.res.status = 404
          return { error: 'User not found', id: failure.value.id } satisfies ErrorResponse
        }
        case 'DatabaseError': {
          event.res.status = 500
          return { error: 'Database error' } satisfies ErrorResponse
        }
        case 'ConfigError': {
          event.res.status = 500
          return { error: 'Configuration error' } satisfies ErrorResponse
        }
      }
    }

    event.res.status = 500
    return { error: 'Internal server error' } satisfies ErrorResponse
  })
