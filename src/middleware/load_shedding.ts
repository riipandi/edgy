import { definePlugin, HTTPError } from 'h3'
import { runtimeOf } from '../kernel/http/runtime.ts'
import { recordShedRequest } from '../observer/metrics.ts'

/**
 * Paths that keep answering under overload. A refused readiness probe makes the balancer
 * drop an instance that is only busy, and a refused scrape hides the overload it should show.
 */
const EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health', '/metrics'])

/**
 * Overload guard. Past `MAX_IN_FLIGHT` requests in progress, new ones get an immediate
 * `503` with `Retry-After`, before the body is read or any query runs.
 *
 * Without it a burst queues behind the single event loop and every request slows until it
 * times out. With it the excess fails fast and admitted requests keep their latency. The
 * in-flight count includes the current request, hence `>`.
 *
 * Register it after `httpObserver`, so refused requests are logged and counted, and after
 * the request id and CORS plugins, so the `503` carries their headers.
 */
export const loadShedding = definePlugin((app) => {
  app.use((event, next) => {
    const runtime = runtimeOf(event)
    const { maxInFlight } = runtime
    if (
      maxInFlight > 0 &&
      runtime.inFlight.active() > maxInFlight &&
      !EXEMPT_PATHS.has(event.url.pathname)
    ) {
      runtime.runSync(recordShedRequest)
      event.res.errHeaders.set('retry-after', '1')
      throw new HTTPError({ status: 503, message: 'Server is overloaded, retry shortly' })
    }
    return next()
  })
})
