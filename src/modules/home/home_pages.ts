import { Effect } from 'effect'
import { definePageHandler } from '../../kernel/http/page.ts'

/**
 * `GET /`: the front page. It reads nothing, so it needs no service; it is still a page like any
 * other (timeout, tracing, the shared headers and CSP), which is what makes it a safe place to
 * start from. Liveness for proxies and load balancers is `/health`, not this.
 */
export const homePageHandler = definePageHandler({
  load: () => Effect.succeed({}),
  template: () => import('../../../app/pages/home.marko')
})
