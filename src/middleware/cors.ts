import { definePlugin, handleCors, type CorsOptions } from 'h3'
import type { CorsConfig } from '../kernel/config/cors.ts'

/**
 * Response headers a browser script may read across origins. Without this list only the
 * CORS-safelisted ones are visible, so a web client could not see its request id, its rate
 * limit or the next page.
 */
const EXPOSED_HEADERS = [
  'x-request-id',
  'x-trace-id',
  'x-cache',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'link'
] as const

/** Translates the app's CORS configuration into h3's `CorsOptions`. */
const toCorsOptions = (cors: CorsConfig): CorsOptions => ({
  origin: cors.origins === '*' ? '*' : [...cors.origins],
  methods: cors.methods === '*' ? '*' : [...cors.methods],
  allowHeaders: cors.allowHeaders === '*' ? '*' : [...cors.allowHeaders],
  exposeHeaders: [...EXPOSED_HEADERS],
  credentials: cors.credentials,
  maxAge: cors.maxAge,
  preflight: { statusCode: 204 }
})

/**
 * CORS plugin.
 *
 * Applies the policy from configuration (`CORS_ORIGINS`, `CORS_METHODS`,
 * `CORS_ALLOW_HEADERS`, `CORS_CREDENTIALS`, `CORS_MAX_AGE`) to every route:
 *
 * - a preflight (`OPTIONS`) request is answered immediately with `204`;
 * - any other request gets the `Access-Control-*` headers and continues.
 *
 * h3 writes these headers to both `event.res.headers` and `event.res.errHeaders`,
 * so CORS survives on error responses too.
 *
 * The policy is passed in by the composition root (`createApp`), which reads it
 * from `ConfigService`; the `credentials` + wildcard-origin combination is
 * already rejected at startup by the config layer.
 */
export const cors = definePlugin<CorsConfig>((app, config) => {
  const options = toCorsOptions(config)

  app.use((event, next) => {
    const preflight = handleCors(event, options)
    return preflight === false ? next() : preflight
  })
})
