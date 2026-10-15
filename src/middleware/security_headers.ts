import { definePlugin, onRequest } from 'h3'

/**
 * Response headers that harden a JSON API. They are fixed: this server never serves HTML,
 * so the strictest values always apply.
 *
 * - `x-content-type-options`: browsers must not sniff a JSON body into HTML.
 * - `content-security-policy`: nothing may load or frame the response.
 * - `referrer-policy`: no URL leaks through `Referer`.
 *
 * `Strict-Transport-Security` is not set here: TLS terminates at the proxy or platform, the
 * only place that knows the origin is HTTPS-only.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
}

/**
 * Adds {@link SECURITY_HEADERS} to every response, errors included. h3 builds an error
 * response from `errHeaders` only, so the headers go to both `event.res.headers` and
 * `event.res.errHeaders`.
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
