import { type H3Plugin, type Middleware } from 'h3'
import type { AppConfig } from '../kernel/config/service.ts'
import { rateLimitMiddleware, type RateCheck } from '../middleware/rate_limit.ts'
import { homePageHandler } from '../web/home.ts'
import { userPages } from '../web/user.ts'
import { limitOptions } from './options.ts'

/**
 * HTML pages at the origin root, outside the API envelope, under the same rate limit as the API.
 * They are not a group (a group at the root would wrap every later route), so each page carries
 * the limiter as route middleware. Probes, assets and `/.well-known` stay outside it.
 */
export const pageRoutes = (config: AppConfig, check: RateCheck): H3Plugin => {
  const middleware: Middleware[] = config.security.rateLimitEnabled
    ? [rateLimitMiddleware(limitOptions(config, check))]
    : []
  return (app) => {
    app.get('/', homePageHandler, { middleware })
    app.register(userPages(middleware))
  }
}
