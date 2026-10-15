import { definePlugin, HTTPError } from 'h3'
import { runtimeOf } from '../kernel/http/runtime.ts'
import { recordShedRequest } from '../observer/metrics.ts'

/**
 * Paths that must keep answering under overload. A readiness probe that is itself
 * refused would make the balancer pull an instance that is merely busy, and a scrape
 * that is refused hides the very overload it should show.
 */
const EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health', '/metrics'])

/**
 * Overload guard: past `MAX_IN_FLIGHT` requests handled at once, new ones are refused
 * immediately with `503` and `Retry-After`, before any body is read or any query runs.
 *
 * Without it a burst is accepted, queued behind the single event loop, and every
 * request gets slower together until they hit `REQUEST_TIMEOUT`; with it the excess
 * fails fast and the requests already admitted keep their latency. The decision uses
 * the in-flight count `provideRuntime` already keeps (this request included, hence
 * `>`), one integer comparison per request.
 *
 * Register it after `httpObserver`, so refused requests are logged and counted, and
 * after `requestId` and CORS, so the 503 carries the request id and CORS headers.
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
