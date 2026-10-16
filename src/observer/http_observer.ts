import { Effect, Tracer } from 'effect'
import { definePlugin, type H3Event, onError, onResponse } from 'h3'
import { codeForStatus } from '../kernel/http/error_body.ts'
import { runtimeOf } from '../kernel/http/runtime.ts'
import { recordHttpRequest } from './metrics.ts'
import { isProbe, quietReason } from './quiet_paths.ts'
import { traceTypeId } from './trace_id.ts'

/** Milliseconds elapsed since the request began, rounded to 0.01 ms. */
const elapsedMs = (event: H3Event): number => {
  const startedAt = event.context.startedAt
  if (startedAt === undefined) return 0
  return Math.round((performance.now() - startedAt) * 100) / 100
}

/**
 * `Server-Timing`: server time, shown in dev tools and read by tracing proxies. Set on both the
 * response and the error path, which h3 builds from different headers.
 */
const serverTiming = (event: H3Event): string => `total;dur=${elapsedMs(event)}`

/**
 * Emits one structured log line and one metric sample for a finished request.
 *
 * The message stays human-readable (`GET /users 200 3.2ms`) while the fields travel as
 * annotations: the JSON sink indexes them all, the pretty sink skips those the message already
 * states. The level follows the status class: `info` for success, `warning` for 4xx, `error` for
 * 5xx. A 503 is a warning, because the server answers it on purpose while draining.
 * Running through the shared runtime keeps the line on the same non-blocking logger.
 */
const observe = (event: H3Event, status: number): void => {
  const { requestId } = event.context
  const method = event.req.method
  const path = event.url.pathname
  const durationMs = elapsedMs(event)

  // The request's fiber has ended by now, so the span is named as parent to keep the line in
  // the request's trace.
  const { trace } = event.context
  const withTrace = <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
    trace === undefined ? effect : Effect.withParentSpan(effect, Tracer.externalSpan(trace))

  // Noise (a favicon, a health poll, a scanner's 404) logs at Debug: hidden at Info, shown
  // with LOG_LEVEL=Debug.
  const quiet = quietReason(path, status)

  // Errors h3 raises itself reach this hook before the envelope names them, so the status
  // yields the code the envelope will use.
  const errorCode = event.context.errorCode ?? (status >= 400 ? codeForStatus(status) : undefined)

  const level =
    quiet !== undefined
      ? Effect.logDebug
      : status >= 500 && status !== 503
        ? Effect.logError
        : status >= 400
          ? Effect.logWarning
          : Effect.logInfo

  runtimeOf(event).runSync(
    Effect.all(
      [
        withTrace(
          level(`${method} ${path} ${status} ${durationMs}ms`).pipe(
            Effect.annotateLogs({
              ...(requestId === undefined ? {} : { requestId }),
              method,
              path,
              status,
              durationMs,
              ...(trace?.sampled === true ? { traceId: traceTypeId(trace.traceId) } : {}),
              ...(errorCode === undefined ? {} : { errorCode }),
              ...(event.context.cache === undefined ? {} : { cache: event.context.cache }),
              ...(event.context.location?.country === undefined
                ? {}
                : { country: event.context.location.country }),
              ...(event.context.location?.city === undefined
                ? {}
                : { city: event.context.location.city }),
              ...(quiet === undefined ? {} : { quiet })
            })
          )
        ),
        recordHttpRequest(method, status, durationMs, { timed: !isProbe(path) })
      ],
      { discard: true }
    )
  )
}

/**
 * HTTP observer plugin: request logging and request metrics in one place.
 *
 * The status comes from the response h3 is about to send (`onResponse`), or from the error
 * status when the handler throws (`onError`). After `next()` the raw result is not yet a
 * `Response` and `event.res.status` is still unset, so the resolved response is the only
 * reliable source of the final status.
 *
 * Register it after `requestId`, which supplies the `requestId` annotation, and after
 * `provideRuntime`.
 */
export const httpObserver = definePlugin((app) => {
  const onSuccess = onResponse((response, event) => {
    response.headers.set('server-timing', serverTiming(event))
    observe(event, response.status)
  })

  const onFailure = onError((error, event) => {
    event.res.errHeaders.set('server-timing', serverTiming(event))
    observe(event, error.status)
  })

  app.use((event, next) => {
    event.context.startedAt = performance.now()
    return onSuccess(event, () => onFailure(event, next))
  })
})
