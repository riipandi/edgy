import { definePlugin, H3, type EventHandler, type H3Plugin } from 'h3'

/** Prefix of the JSON API. Everything under it answers in the envelope, errors included. */
export const API_PREFIX = '/api'

/** Whether a request path belongs to the API. */
export const isApiPath = (pathname: string): boolean =>
  pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)

export type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * What a group's `routes` callback may do: declare routes and nest groups. Narrower than `H3` on
 * purpose, so the same callback can also be read without an app (see {@link routesOf}).
 */
export interface RouteTable {
  readonly get: (pattern: string, handler: EventHandler) => void
  readonly post: (pattern: string, handler: EventHandler) => void
  readonly put: (pattern: string, handler: EventHandler) => void
  readonly patch: (pattern: string, handler: EventHandler) => void
  readonly delete: (pattern: string, handler: EventHandler) => void
  readonly register: (plugin: H3Plugin) => void
}

/** Options for `defineRouteGroup`. */
export interface GroupOptions {
  /** URL prefix the group is mounted under, e.g. `/users` or `/.well-known`. */
  readonly prefix: string
  /** Applied to every route in the group, and only those. */
  readonly middleware?: readonly H3Plugin[]
  /** Declares the group's routes; patterns are relative to `prefix`. */
  readonly routes: (group: RouteTable) => void
}

const mount = definePlugin<GroupOptions>((app, options) => {
  const group = new H3()

  for (const middleware of options.middleware ?? []) group.register(middleware)

  options.routes({
    get: (pattern, handler) => group.get(pattern, handler),
    post: (pattern, handler) => group.post(pattern, handler),
    put: (pattern, handler) => group.put(pattern, handler),
    patch: (pattern, handler) => group.patch(pattern, handler),
    delete: (pattern, handler) => group.delete(pattern, handler),
    register: (plugin) => group.register(plugin)
  })
  app.mount(options.prefix, group)
})

const groups = new WeakMap<H3Plugin, GroupOptions>()

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
export const defineRouteGroup = (options: GroupOptions): H3Plugin => {
  const plugin = mount(options)
  groups.set(plugin, options)
  return plugin
}

/** One route of a group, with its full path (`/api/users/:id`). */
export interface DeclaredRoute {
  readonly method: RouteMethod
  readonly path: string
  readonly handler: EventHandler
}

/**
 * The routes `plugin` declares, nested groups included, under `base`. It runs the group's `routes`
 * callback against a recorder, so no app is built and no request is needed. A plugin that is not a
 * route group declares nothing here.
 */
export const routesOf = (plugin: H3Plugin, base = ''): DeclaredRoute[] => {
  const options = groups.get(plugin)
  if (options === undefined) return []

  const prefix = `${base}${options.prefix}`.replace(/\/+$/, '')
  const found: DeclaredRoute[] = []
  const record = (method: RouteMethod) => (pattern: string, handler: EventHandler) => {
    const path = `${prefix}${pattern === '/' ? '' : pattern}`
    found.push({ method, path: path === '' ? '/' : path, handler })
  }
  options.routes({
    get: record('get'),
    post: record('post'),
    put: record('put'),
    patch: record('patch'),
    delete: record('delete'),
    register: (child) => found.push(...routesOf(child, prefix))
  })
  return found
}
