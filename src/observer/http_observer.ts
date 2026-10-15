import { Effect } from 'effect'
import { definePlugin, type H3Event, onError, onResponse } from 'h3'
import { runtimeOf } from '../httputils/runtime.ts'
import { recordHttpRequest } from './metrics.ts'

/** Milliseconds elapsed since the request began, rounded to 0.01 ms. */
const elapsedMs = (event: H3Event): number => {
  const startedAt = event.context.startedAt
  if (startedAt === undefined) return 0
  return Math.round((performance.now() - startedAt) * 100) / 100
}

/**
 * Emits one structured log line and one metric sample for a finished request.
 *
 * The message stays human-readable (`GET /users 200 3.2ms`) while the fields
 * travel as annotations, so the pretty sink renders them alongside the line and
 * the JSON sink can index them. Level follows the status class: `info` for
 * success, `warning` for 4xx, `error` for 5xx. Running through the shared
 * runtime keeps the line on the same non-blocking logger as everything else.
 */
const observe = (event: H3Event, status: number): void => {
  const { requestId } = event.context
  const method = event.req.method
  const path = event.url.pathname
  const durationMs = elapsedMs(event)

  const level = status >= 500 ? Effect.logError : status >= 400 ? Effect.logWarning : Effect.logInfo

  runtimeOf(event).runSync(
    Effect.all(
      [
        level(`${method} ${path} ${status} ${durationMs}ms`).pipe(
          Effect.annotateLogs({
            ...(requestId === undefined ? {} : { requestId }),
            method,
            path,
            status,
            durationMs
          })
        ),
        recordHttpRequest(method, status, durationMs)
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
    observe(event, response.status)
  })

  const onFailure = onError((error, event) => {
    observe(event, error.status)
  })

  app.use((event, next) => {
    event.context.startedAt = performance.now()
    return onSuccess(event, () => onFailure(event, next))
  })
})
