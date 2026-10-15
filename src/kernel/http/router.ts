import { definePlugin, H3, type H3Plugin } from 'h3'

/** Prefix of the JSON API. Everything under it answers in the envelope, errors included. */
export const API_PREFIX = '/api'

/** Whether a request path belongs to the API. */
export const isApiPath = (pathname: string): boolean =>
  pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)

/** Options for `defineRouteGroup`. */
export interface GroupOptions {
  /** URL prefix the group is mounted under, e.g. `/users` or `/.well-known`. */
  readonly prefix: string
  /** Applied to every route in the group, and only those. */
  readonly middleware?: readonly H3Plugin[]
  /** Registers the group's routes on its isolated router. */
  readonly routes: (group: H3) => void
}

/**
 * Declares a route group as an h3 plugin. Each group owns a fresh `H3` instance, so its
 * middleware runs only for its routes, and its patterns are relative to `prefix`.
 *
 * `mount` merges the group's routes into the parent matcher, so they stay routes of one trie
 * rather than a nested fetch hop. h3 does not inherit app-level config or hooks into a mounted
 * app, so shared behaviour belongs in global middleware.
 *
 * @example
 * ```ts
 * const usersRoutes = defineRouteGroup({
 *   prefix: '/users',
 *   middleware: [auth()],
 *   routes: (group) => {
 *     group.get('/', listUsersHandler)
 *     group.post('/', createUserHandler)
 *   }
 * })
 * ```
 */
export const defineRouteGroup = definePlugin<GroupOptions>((app, options) => {
  const group = new H3()

  for (const middleware of options.middleware ?? []) group.register(middleware)

  options.routes(group)
  app.mount(options.prefix, group)
})
