import { Metric } from 'effect'

export const httpRequests = Metric.counter('http_requests', {
  description: 'HTTP requests handled by the Effect server',
  incremental: true
})
