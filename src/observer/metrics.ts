import { Effect, Metric } from 'effect'

export const httpRequests = Metric.counter('http_requests', {
  description: 'HTTP requests handled by the Effect server',
  incremental: true
})

const SECOND_BOUNDARIES = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

export const httpRequestDuration = Metric.histogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  boundaries: SECOND_BOUNDARIES
})

const KNOWN_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT'
])

// Bounded to known methods so an exotic method cannot grow the series set.
export const methodLabel = (method: string): string =>
  KNOWN_METHODS.has(method) ? method : 'OTHER'

// Bounded attributes only, so the series count stays flat no matter the
// traffic: the method collapses to the known set, the code is one numeric
// response, and the route comes from the matched template (contract paths,
// the SSR catch-all, `unmatched`) — never the raw request path.
export const recordRequest = (
  method: string,
  statusCode: number,
  route: string,
  durationMs: number
) =>
  Effect.gen(function* () {
    const boundedMethod = methodLabel(method)
    yield* Metric.update(
      Metric.withAttributes(httpRequests, {
        method: boundedMethod,
        status_code: String(statusCode),
        route
      }),
      1
    )
    yield* Metric.update(
      Metric.withAttributes(httpRequestDuration, { method: boundedMethod, route }),
      Math.max(0, durationMs) / 1000
    )
  })
