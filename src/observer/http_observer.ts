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
 * `Server-Timing`: what the server spent, shown in browser dev tools and read by tracing
 * proxies. Set on both paths (a response, an error), which h3 builds from different headers.
 */
const serverTiming = (event: H3Event): string => `total;dur=${elapsedMs(event)}`

/**
 * Emits one structured log line and one metric sample for a finished request.
 *
 * The message stays human-readable (`GET /users 200 3.2ms`) while the fields
 * travel as annotations: the JSON sink indexes all of them, and the pretty sink
 * prints only those the message does not already say (the `requestId`). Level follows the status class: `info` for
 * success, `warning` for 4xx, `error` for 5xx (except 503, which this server answers on purpose while draining, so it is a warning). Running through the shared
 * runtime keeps the line on the same non-blocking logger as everything else.
 */
const observe = (event: H3Event, status: number): void => {
  const { requestId } = event.context
  const method = event.req.method
  const path = event.url.pathname
  const durationMs = elapsedMs(event)

  // The line is written after the request's fiber has finished, outside its span; naming
  // the span as parent puts the line in the same trace in the log backend.
  const { trace } = event.context
  const withTrace = <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
    trace === undefined ? effect : Effect.withParentSpan(effect, Tracer.externalSpan(trace))

  // Noise (a favicon, a health poll, a scanner's 404) is logged at Debug: gone at Info,
  // back with LOG_LEVEL=Debug. See `quiet_paths.ts` for what counts and why.
  const quiet = quietReason(path, status)

  // The error hook runs before h3 renders an error it raised itself, so the envelope has not
  // named it yet; the status gives the same code `statusBody` will.
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
 * The status is taken from the response h3 is about to send (`onResponse`),
 * falling back to the error status when the handler throws (`onError`). This is
 * deliberate: after `next()` the raw result is not yet a `Response` —
 * `event.res.status` is still unset — so the resolved response is the only
 * reliable place to read the final status.
 *
 * Register it after `requestId`, which provides the `requestId` annotation, and
 * after `provideRuntime`.
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
