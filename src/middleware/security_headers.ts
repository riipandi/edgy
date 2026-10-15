import { definePlugin, onRequest } from 'h3'

/**
 * Response headers that harden a JSON API. They are fixed on purpose: this
 * server never serves HTML, so the strictest values are always right.
 *
 * - `x-content-type-options`: browsers must not sniff a JSON body into HTML.
 * - `content-security-policy`: nothing may load or frame the response.
 * - `referrer-policy`: no URL leaks through `Referer`.
 *
 * `Strict-Transport-Security` is not set here: TLS terminates at the proxy or
 * the platform, which is the only place that knows the origin is HTTPS-only.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
}

/**
 * Adds {@link SECURITY_HEADERS} to every response, including errors: the headers
 * go to both `event.res.headers` and `event.res.errHeaders`, because h3 builds an
 * error response from the latter only (same reason as the request id).
 */
export const securityHeaders = definePlugin((app) => {
  app.use(
    onRequest((event) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        event.res.headers.set(name, value)
        event.res.errHeaders.set(name, value)
      }
    })
  )
})
