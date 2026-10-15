import { Exit } from 'effect'
import { PrometheusMetrics } from 'effect/observability'
import { HTTPError, type H3Event } from 'h3'
import { runtimeOf } from '../kernel/http/runtime.ts'

/**
 * `GET /metrics`: every recorded metric in Prometheus exposition format.
 *
 * Plain text by contract (Prometheus does not read the API envelope), and
 * unauthenticated, so it is mounted only when `METRICS_ENABLED` is set and should
 * be reachable only from a private network.
 */
export const metricsHandler = async (event: H3Event): Promise<Response> => {
  const exit = await runtimeOf(event).runPromiseExit(PrometheusMetrics.format())
  if (Exit.isFailure(exit)) throw new HTTPError({ status: 500, message: 'Metrics unavailable' })

  const headers = new Headers(event.res.headers)
  headers.set('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  return new Response(exit.value, { headers })
}
