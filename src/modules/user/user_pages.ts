import { Effect } from 'effect'
import { getQuery, type H3Plugin, type Middleware } from 'h3'
import { decode } from '../../kernel/http/decode.ts'
import { definePageHandler } from '../../kernel/http/page.ts'
import { paginationLinks, paginationMeta, toPageRequest } from '../../kernel/http/pagination.ts'
import { DEFAULT_SORT, UserListQuerySchema } from './user_schema.ts'
import { UserService } from './user_service.ts'

/**
 * `GET /users`: the user directory as an HTML page. It takes the same parameters as `GET /api/users`
 * and reads through the same service, so the page and the API cannot disagree. The list is fetched on
 * the server; the template only filters what it was given.
 */
const usersPageHandler = definePageHandler({
  load: (event) =>
    Effect.gen(function* () {
      const query = yield* decode(UserListQuerySchema)(getQuery(event))
      const request = toPageRequest(query, DEFAULT_SORT)
      const page = yield* UserService.use((users) => users.list(request))
      const links = paginationLinks(event.url, paginationMeta(page))
      return {
        users: page.items,
        // A way back to the start only where there is somewhere else to be.
        first: query.cursor === undefined ? null : (links['first'] ?? null),
        next: links['next'] ?? null
      }
    }),
  template: () => import('../../../app/pages/users.marko')
})

/** The `/users` page, with the middleware that guards it. */
export const userPages =
  (middleware: readonly Middleware[]): H3Plugin =>
  (app) => {
    app.get('/users', usersPageHandler, { middleware: [...middleware] })
  }
