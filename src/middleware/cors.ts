import { definePlugin, handleCors, type CorsOptions } from 'h3'
import type { CorsConfig } from '../kernel/config/cors.ts'

/**
 * Response headers a browser script may read across origins. Without them only the
 * CORS-safelisted headers are visible, so a web client could not read its request id,
 * rate limit or next page.
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
 * CORS plugin. Applies the configured policy to every route. A preflight (`OPTIONS`) is
 * answered at once with `204`; any other request gets the `Access-Control-*` headers and
 * continues.
 *
 * h3 writes these headers to both `event.res.headers` and `event.res.errHeaders`, so they
 * survive error responses too.
 *
 * The caller supplies the policy. The config layer already rejects `credentials` combined
 * with a wildcard origin.
 */
export const cors = definePlugin<CorsConfig>((app, config) => {
  const options = toCorsOptions(config)

  app.use((event, next) => {
    const preflight = handleCors(event, options)
    return preflight === false ? next() : preflight
  })
})
