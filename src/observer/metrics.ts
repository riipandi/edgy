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

/** Requests refused by the overload guard (`MAX_IN_FLIGHT`). */
const httpShed = Metric.counter('http_requests_shed_total', {
  description: 'Requests refused with 503 because too many were already in flight',
  incremental: true
})

/** Counts one request refused by the overload guard. */
export const recordShedRequest: Effect.Effect<void> = Metric.update(httpShed, 1)

const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/**
 * The method as a metric label. The method comes from the client and every distinct value is a
 * time series kept for the life of the process, so anything but a standard method maps to one
 * `OTHER` series.
 */
export const metricMethod = (method: string): string =>
  KNOWN_METHODS.has(method) ? method : 'OTHER'

/**
 * Records one finished request. Called for **every** response, errors and 404s included. The
 * timer skips probes (`timed: false`): a probe polled every second answers in microseconds and
 * would drag the latency percentiles toward zero.
 */
export const recordHttpRequest = (
  method: string,
  status: number,
  durationMs: number,
  options: { readonly timed: boolean } = { timed: true }
): Effect.Effect<void> => {
  const attributes = { method: metricMethod(method), status: String(status) }
  const count = Metric.update(Metric.withAttributes(httpRequests, attributes), 1)
  return options.timed
    ? Effect.all(
        [
          count,
          Metric.update(
            Metric.withAttributes(httpDuration, attributes),
            Duration.millis(durationMs)
          )
        ],
        { discard: true }
      )
    : count
}
