import { HTTPError, type H3Plugin } from 'h3'
import { healthHandler } from '../handler/health_handler.ts'
import { createUserHandler, getUserHandler, listUsersHandler } from '../handler/user_handler.ts'
import { cacheControl } from '../middleware/cache_control.ts'
import { defineGroup } from './group.ts'

/**
 * `/users` resource group.
 *
 * Patterns are relative to the prefix, so this file reads as a single
 * resource rather than a slice of one flat route table.
 */
export const usersRoutes: H3Plugin = defineGroup({
  prefix: '/users',
  routes: (r) => {
    r.get('/', listUsersHandler)
    r.get('/:id', getUserHandler)
    r.post('/', createUserHandler)
  }
})

/**
 * `/.well-known` group.
 *
 * Reserved-path endpoints (RFC 8615) that must sit at the origin root. The
 * group carries its own middleware — `Cache-Control` here — without leaking it
 * to any other route.
 */
const wellKnownRoutes: H3Plugin = defineGroup({
  prefix: '/.well-known',
  middleware: [cacheControl({ value: 'public, max-age=86400' })],
  routes: (r) => {
    r.get('/security.txt', () => ({
      contact: 'mailto:security@example.com',
      expires: '2027-12-31T23:59:59Z'
    }))
  }
})

/**
 * Root routes that do not belong to a resource group.
 *
 * Declared as a plugin so `app.ts` composes it like every other group.
 */
const rootRoutes: H3Plugin = (app) => {
  app.get('/', () => ({ message: 'All is well' }))
  app.get('/health', healthHandler)
}

/**
 * Catch-all for paths no route claims. The lowest-priority pattern in the trie,
 * so it only answers what nothing else matched.
 *
 * It throws instead of letting h3 return its internal not-found marker: h3's
 * `onResponse` middleware (used by the observer) converts that marker with the
 * default config before the app's `onError` hook can see it, which would leak
 * h3's own error body. A thrown `HTTPError` reaches the hook.
 */
const notFoundRoutes: H3Plugin = (app) => {
  app.all('/**', () => {
    throw new HTTPError({ status: 404 })
  })
}

/** Every route plugin, in registration order. */
export const routePlugins: readonly H3Plugin[] = [
  rootRoutes,
  usersRoutes,
  wellKnownRoutes,
  notFoundRoutes
]
