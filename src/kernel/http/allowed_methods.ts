import type { H3 } from 'h3'
import { findAllRoutes } from 'rou3'

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/** The route data h3 keeps for each route it registers; only the pattern is read here. */
interface Registered {
  readonly route: string
}

const isRegistered = (data: unknown): data is Registered =>
  typeof data === 'object' && data !== null && typeof Reflect.get(data, 'route') === 'string'

/**
 * The methods `pathname` answers, for an `Allow` header: those for which `app` has a route other
 * than the `/**` catch-all. h3 serves a `HEAD` from the `GET` route, so a path with `GET` allows it.
 *
 * Reads h3's router (`~rou3`), the only place that knows. h3 has no public lookup; a change to that
 * property fails `allowed_methods.test.ts`.
 */
export const allowedMethods = (app: H3, pathname: string): string[] => {
  const allowed = new Set<string>()
  for (const method of METHODS) {
    const matches = findAllRoutes(app['~rou3'], method, pathname)
    if (matches.some((match) => isRegistered(match.data) && match.data.route !== '/**')) {
      allowed.add(method)
    }
  }
  if (allowed.has('GET')) allowed.add('HEAD')
  return METHODS.filter((method) => allowed.has(method))
}
