import { H3, type H3Plugin } from 'h3'
import { cors } from './middleware/cors.ts'
import { requestId } from './middleware/request_id.ts'
import { requestLogger } from './middleware/request_logger.ts'
import { routePlugins } from './routes/groups.ts'

/**
 * Global plugins, applied to every request before any route.
 *
 * Order matters: h3 registers plugins immediately, and middleware runs in
 * registration order, so CORS can answer a preflight before anything else, the
 * request id is assigned next, and the logger reads it last for its
 * annotations.
 *
 * These are registered on the root app **before** the route groups are mounted,
 * which guarantees they wrap every group's own middleware too.
 */
export const globalPlugins: readonly H3Plugin[] = [cors(), requestId(), requestLogger()]

/**
 * Builds the fully wired application router.
 *
 * Composition is plugin-only: globals first, then the route groups. Keeping the
 * wiring in one function makes the app trivial to construct in tests with a
 * different plugin set.
 */
export const createApp = (plugins: readonly H3Plugin[] = [...globalPlugins, ...routePlugins]): H3 =>
  new H3({ plugins: [...plugins] })

/** Application router used by the HTTP server. */
export const app: H3 = createApp()

/** Route plugins: the root route plus every mounted group. */
export { routePlugins }
