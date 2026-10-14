import { Effect } from 'effect'
import { type H3Event, type Middleware, onError, onResponse } from 'h3'
import { AppRuntime } from '../runtime.ts'
import { requestIdOf } from './request_id.ts'

/** Context key holding the request start timestamp (set by this middleware). */
const STARTED_AT = 'requestStartedAt'

/** Milliseconds elapsed since the request began, rounded to 0.01 ms. */
const elapsedMs = (event: H3Event): number => {
  const startedAt = event.context[STARTED_AT]
  if (typeof startedAt !== 'number') return 0
  return Math.round((performance.now() - startedAt) * 100) / 100
}

/**
 * Emits one structured log line through the Effect logger.
 *
 * The message stays human-readable (`GET /users 200 3.2ms`) while the fields
 * travel as annotations, so the pretty console logger renders them alongside
 * the line and JSON sinks can index them. Level follows the status class:
 * `info` for success, `warning` for 4xx, `error` for 5xx.
 */
const logRequest = (event: H3Event, status: number): void => {
  const requestId = requestIdOf(event)
  const durationMs = elapsedMs(event)

  const annotations = {
    ...(requestId === undefined ? {} : { requestId }),
    method: event.req.method,
    path: event.url.pathname,
    status,
    durationMs
  }

  const message = `${event.req.method} ${event.url.pathname} ${status} ${durationMs}ms`
  const level = status >= 500 ? Effect.logError : status >= 400 ? Effect.logWarning : Effect.logInfo

  AppRuntime.runSync(level(message).pipe(Effect.annotateLogs(annotations)))
}

/**
 * HTTP request logger middleware.
 *
 * Wraps every request and reports the final status and latency through the
 * application's Effect logger (`ObservabilityLayer`), so request logs share the
 * same sink, annotations and span context as the rest of the app.
 *
 * The status is taken from the response that h3 is about to send (via
 * `onResponse`), falling back to the error status when the handler throws (via
 * `onError`). This is deliberate: after `next()` the raw result is not yet a
 * `Response` — `event.res.status` is still unset — so the resolved response is
 * the only reliable place to read the final status.
 *
 * Register it after {@link requestId}, which provides the `requestId`
 * annotation.
 */
export const requestLogger = (): Middleware => {
  const onSuccess = onResponse((response, event) => {
    logRequest(event, response.status)
  })

  const onFailure = onError((error, event) => {
    logRequest(event, error.status)
  })

  return (event, next) => {
    event.context[STARTED_AT] = performance.now()
    return onSuccess(event, () => onFailure(event, next))
  }
}
