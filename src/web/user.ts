import { Effect } from 'effect'
import { getQuery, type H3Plugin, type Middleware } from 'h3'
import { decode } from '../kernel/http/decode.ts'
import { definePageHandler } from '../kernel/http/page.ts'
import { paginationLinks, paginationMeta, toPageRequest } from '../kernel/http/pagination.ts'
import { DEFAULT_SORT, UserListQuerySchema } from '../modules/user/user_schema.ts'
import { UserService } from '../modules/user/user_service.ts'

/**
 * `GET /users`: the user directory as an HTML page. It takes the same parameters as `GET /api/users`
 * and reads through the same service, so the page and the API cannot agree to disagree. The route
 * component (`src/pages/users.tsx`) draws its list from `/rpc` — phase 4 of plan-20261018_0105;
 * until then the page program still runs (parameters, rate limit, tracing) and the route renders
 * its empty shell.
 */
const usersPageHandler = definePageHandler({
  load: (event) =>
    Effect.gen(function* () {
      const query = yield* decode(UserListQuerySchema)(getQuery(event))
      const request = toPageRequest(query, DEFAULT_SORT)
      const page = yield* UserService.use((users) => users.list(request))
      const links = paginationLinks(event.url, paginationMeta(page))
      return {
        title: 'Users',
        // The route component reads from `/rpc`; the loaded page keeps only its title until then.
        users: page.items,
        first: query.cursor === undefined ? null : (links['first'] ?? null),
        next: links['next'] ?? null
      }
    }),
  template: () => import('../pages/app.tsx')
})

/** The `/users` page, with the middleware that guards it. */
export const userPages =
  (middleware: readonly Middleware[]): H3Plugin =>
  (app) => {
    app.get('/users', usersPageHandler, { middleware: [...middleware] })
  }
