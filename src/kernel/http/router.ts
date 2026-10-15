import { definePlugin, H3, type H3Plugin } from 'h3'

/**
 * Where the JSON API lives. What is under it answers in the envelope, errors included; everything
 * else is for people and answers in HTML, errors included.
 */
export const API_PREFIX = '/api'

/** Whether a request path belongs to the API. */
export const isApiPath = (pathname: string): boolean =>
  pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)

/** Declaration accepted by {@link defineRouteGroup}. */
export interface GroupOptions {
  /** URL prefix the group is mounted under, e.g. `/users` or `/.well-known`. */
  readonly prefix: string
  /**
   * Middleware applied to every route in the group — and only those routes.
   * Given as plugins so a group composes the same primitives as the app.
   */
  readonly middleware?: readonly H3Plugin[]
  /** Registers the group's routes on its isolated router. */
  readonly routes: (group: H3) => void
}

/**
 * Declares a route group as an h3 plugin.
 *
 * Each group owns a fresh `H3` instance, so:
 *
 * - its middleware runs **only** for its routes;
 * - its route patterns are written relative to `prefix`, with no repeated
 *   `/users/...` boilerplate as the API grows.
 *
 * `mount` merges the group's routes into the parent matcher, so they remain
 * real routes of a single rou3 trie (one fast lookup) rather than a nested
 * fetch hop. Per h3's docs, app-level config and hooks are not inherited by a
 * mounted app — shared behaviour belongs in global middleware instead.
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
