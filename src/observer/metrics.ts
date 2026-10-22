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

export const statusClass = (status: number): string => `${Math.floor(status / 100)}xx`

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

// Bounded attributes only (method, status class) so the series count stays flat
// no matter how many routes exist.
export const recordRequest = (method: string, status: string, durationMs: number) =>
  Effect.gen(function* () {
    const boundedMethod = methodLabel(method)
    yield* Metric.update(Metric.withAttributes(httpRequests, { method: boundedMethod, status }), 1)
    yield* Metric.update(
      Metric.withAttributes(httpRequestDuration, { method: boundedMethod }),
      Math.max(0, durationMs) / 1000
    )
  })
