import { Effect } from 'effect'
import { definePageHandler } from '../kernel/http/page.ts'

/** `GET /`: the front page. It reads nothing, so it needs no service. */
export const homePageHandler = definePageHandler({
  load: () => Effect.succeed({ title: 'edgy' }),
  template: () => import('../pages/app.tsx')
})
