import { Effect } from 'effect'
import { getQuery, type H3Plugin, type Middleware } from 'h3'
import { clientManifest } from '../kernel/http/client_manifest.ts'
import { decode } from '../kernel/http/decode.ts'
import { definePageHandler } from '../kernel/http/page.ts'
import { paginationLinks, paginationMeta, toPageRequest } from '../kernel/http/pagination.ts'
import { DEFAULT_SORT, UserListQuerySchema } from '../modules/user/user_schema.ts'
import { UserService } from '../modules/user/user_service.ts'

/**
 * `GET /users`: the user directory as an HTML page. It takes the same parameters as `GET /api/users`
 * and reads through the same service, so the page and the API cannot agree to disagree. The
 * interactive part hydrates from the built `users-page` entry, whose hashed names the manifest
 * carries.
 */
const usersPageHandler = definePageHandler({
  load: (event) =>
    Effect.gen(function* () {
      const query = yield* decode(UserListQuerySchema)(getQuery(event))
      const request = toPageRequest(query, DEFAULT_SORT)
      const page = yield* UserService.use((users) => users.list(request))
      const links = paginationLinks(event.url, paginationMeta(page))
      // In development there is no build; Vite injects its own module scripts into the page.
      const entry = event.context.development === true ? undefined : clientManifest['users-page']
      return {
        users: page.items,
        // A way back to the start only where there is somewhere else to be.
        first: query.cursor === undefined ? null : (links['first'] ?? null),
        next: links['next'] ?? null,
        scripts: entry === undefined ? [] : [entry.script, ...entry.styles]
      }
    }),
  template: () => import('../../web/pages/users/page.tsx')
})

/** The `/users` page, with the middleware that guards it. */
export const userPages =
  (middleware: readonly Middleware[]): H3Plugin =>
  (app) => {
    app.get('/users', usersPageHandler, { middleware: [...middleware] })
  }
