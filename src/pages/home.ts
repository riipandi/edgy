import { Effect } from 'effect'
import { definePageHandler } from '../kernel/http/page.ts'

/**
 * `GET /`: the front page. It reads nothing, so it needs no service. Liveness for proxies and
 * load balancers is `/health`. The Solid page itself lands in phase 3 of plan-20261018_0105;
 * until then the handler answers through `htmlResponse`'s 503 via the same placeholder.
 */
export const homePageHandler = definePageHandler({
  load: () => Effect.succeed({}),
  template: () =>
    Promise.resolve({
      default: () => {
        throw new Error('No Solid page yet (plan-20261018_0105 phase 3)')
      }
    })
})
