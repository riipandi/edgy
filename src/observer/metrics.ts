import { Duration, Effect, Metric } from 'effect'

/** Total HTTP requests handled, labelled by method and final status. */
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
 * Records one finished request. Called from the HTTP observer for **every**
 * response (including 404s and errors), so the counter and the timer agree.
 */
export const recordHttpRequest = (
  method: string,
  status: number,
  durationMs: number
): Effect.Effect<void> => {
  const attributes = { method, status: String(status) }
  return Effect.all(
    [
      Metric.update(Metric.withAttributes(httpRequests, attributes), 1),
      Metric.update(Metric.withAttributes(httpDuration, attributes), Duration.millis(durationMs))
    ],
    { discard: true }
  )
}
