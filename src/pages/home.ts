import { Effect } from 'effect'
import { definePageHandler, noRendererYet } from '../kernel/http/page.ts'

/**
 * `GET /`: the front page. It reads nothing, so it needs no service. Liveness for proxies and
 * load balancers is `/health`. The Solid template lands in phase 3 of plan-20261018_0105; until
 * then the handler answers through `htmlResponse`'s 503.
 */
export const homePageHandler = definePageHandler({
  load: () => Effect.succeed({}),
  template: () => noRendererYet()
})
