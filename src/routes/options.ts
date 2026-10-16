import type { AppConfig } from '../kernel/config/service.ts'
import { makeClientResolver } from '../middleware/client_ip.ts'
import type { RateCheck, RateLimitOptions } from '../middleware/rate_limit.ts'

/** How the groups that do work per request (the API and the pages) count a client. */
export const limitOptions = (config: AppConfig, check: RateCheck): RateLimitOptions => ({
  check,
  clientOf: makeClientResolver({
    proxies: config.server.trustProxy,
    platformHeader: config.server.trustedPlatform
  })
})
