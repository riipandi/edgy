import { Effect } from 'effect'
import { definePageHandler } from '../kernel/http/page.ts'

/**
 * `GET /`: the front page. It reads nothing, so it needs no service, but it is a page like any other
 * (timeout, tracing, shared headers and CSP). Liveness for proxies and load balancers is `/health`.
 */
export const homePageHandler = definePageHandler({
  load: () => Effect.succeed({}),
  template: () => import('../../web/pages/home/page.marko')
})
