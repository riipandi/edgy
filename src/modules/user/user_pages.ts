import { Effect } from 'effect'
import { getQuery, type H3Plugin, type Middleware } from 'h3'
import { decode } from '../../kernel/http/decode.ts'
import { definePageHandler } from '../../kernel/http/page.ts'
import { toPageRequest } from '../../kernel/http/pagination.ts'
import { UserListQuerySchema } from './user_schema.ts'
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
      const request = toPageRequest(query, { sortBy: 'id' })
      const page = yield* UserService.use((users) => users.list(request))
      return {
        users: page.items,
        remaining: Math.max(0, page.total - request.offset - page.items.length)
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
