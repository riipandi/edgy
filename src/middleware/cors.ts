import { definePlugin, handleCors, type CorsOptions } from 'h3'
import { ConfigService, type CorsConfig } from '../config.ts'
import { AppRuntime } from '../runtime.ts'

/** Translates the app's CORS configuration into h3's `CorsOptions`. */
const toCorsOptions = (cors: CorsConfig): CorsOptions => ({
  origin: cors.origins === '*' ? '*' : [...cors.origins],
  methods: cors.methods === '*' ? '*' : [...cors.methods],
  allowHeaders: cors.allowHeaders === '*' ? '*' : [...cors.allowHeaders],
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
 * Configuration is resolved once, when the plugin is registered, and the
 * `credentials` + wildcard-origin combination is rejected at startup by the
 * config layer.
 */
export const cors = definePlugin((app) => {
  const { cors: corsConfig } = AppRuntime.runSync(ConfigService)
  const options = toCorsOptions(corsConfig)

  app.use((event, next) => {
    const preflight = handleCors(event, options)
    return preflight === false ? next() : preflight
  })
})
