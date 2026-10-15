import { Effect } from 'effect'
import { getQuery } from 'h3'
import { decode } from '../../kernel/http/decode.ts'
import { definePageHandler } from '../../kernel/http/page.ts'
import { toPageRequest } from '../../kernel/http/pagination.ts'
import { defineRouteGroup } from '../../kernel/http/router.ts'
import { UserListQuerySchema } from './user_schema.ts'
import { UserService } from './user_service.ts'

/**
 * `GET /users`: the directory as an HTML page. It reads through the same service as
 * `GET /api/users` and takes the same `page`, `limit` and sort parameters, so the page and the API
 * cannot disagree about who exists. The list is fetched here, on the server; the template only
 * filters what it was given.
 */
export const usersPageHandler = definePageHandler({
  load: (event) =>
    Effect.gen(function* () {
      const query = yield* decode(UserListQuerySchema)(getQuery(event))
      const page = yield* UserService.use((users) =>
        users.list(toPageRequest(query, { sortBy: 'id' }))
      )
      return { users: page.items, total: page.total }
    }),
  template: () => import('../../../app/pages/users.marko')
})

/** `/users` page group; `routes/route.ts` mounts it at the origin root, beside the API. */
export const userPages = defineRouteGroup({
  prefix: '/users',
  routes: (r) => {
    r.get('/', usersPageHandler)
  }
})
