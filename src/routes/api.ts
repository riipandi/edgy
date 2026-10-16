import type { H3Plugin } from 'h3'
import type { AppConfig } from '../kernel/config/service.ts'
import { API_PREFIX, defineRouteGroup } from '../kernel/http/router.ts'
import { cacheControl } from '../middleware/cache_control.ts'
import { rateLimit, type RateCheck } from '../middleware/rate_limit.ts'
import { userRoutes } from '../modules/user/user_routes.ts'
import { limitOptions } from './options.ts'

/** Every module whose routes are served under `/api` (and so described by the API document). */
export const apiModules: readonly H3Plugin[] = [userRoutes]

/**
 * `/api` group: every resource endpoint that answers in the API envelope. Middleware shared by the
 * whole API lives here. Probes and reserved paths stay outside, since load balancers and RFC 8615
 * clients expect them at the origin root.
 */
export const apiRoutes = (config: AppConfig, check: RateCheck): H3Plugin =>
  defineRouteGroup({
    prefix: API_PREFIX,
    middleware: [
      // API answers are per caller, so no cache may store them.
      cacheControl({ value: 'no-store', errors: true }),
      ...(config.security.rateLimitEnabled ? [rateLimit(limitOptions(config, check))] : [])
    ],
    routes: (api) => {
      for (const module of apiModules) api.register(module)
    }
  })
