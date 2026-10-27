import { Effect } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'

// Response hardening applied to every server response. StyleX ships compiled
// stylesheets, so the CSP allows inline styles (hydration writes style
// attributes) but no inline scripts by default; the Scalar reference is
// self-hosted and loads only same-origin assets.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
] as const

// HTML responses stream inline hydration scripts, so they carry a
// per-request nonce and 'strict-dynamic' to admit the module scripts those
// bootstrap scripts inject.
export const cspFor = (nonce?: string): string =>
  (nonce === undefined
    ? CSP_DIRECTIVES
    : [`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`, ...CSP_DIRECTIVES]
  ).join('; ')

// The Scalar reference is one self-hosted page whose bootstrap script is
// inline and carries no nonce, so it admits inline scripts on that route
// alone. Scoped to the docs layer, never global.
export const docsCspFor = (): string =>
  [`script-src 'self' 'unsafe-inline'`, ...CSP_DIRECTIVES].join('; ')

// A response that already carries a CSP (the renderer's nonced page CSP)
// keeps it; the remaining hardening headers are set regardless so no
// response path loses them. Callers with a route-specific CSP pass it as
// the fallback.
export const applySecurityHeaders =
  (csp: string = cspFor()) =>
  (response: HttpServerResponse.HttpServerResponse) => {
    const based =
      response.headers['content-security-policy'] === undefined
        ? HttpServerResponse.setHeader(response, 'content-security-policy', csp)
        : response
    return HttpServerResponse.setHeaders({
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY'
    })(based)
  }

export const securityHeadersMiddleware = HttpRouter.middleware(
  (httpEffect) => Effect.map(httpEffect, applySecurityHeaders()),
  { global: true }
)

// The docs layer overrides the global CSP (the global middleware runs
// outside it and has already stamped the default) and still carries the
// hardening headers.
export const docsSecurityHeadersMiddleware = HttpRouter.middleware((httpEffect) =>
  Effect.map(httpEffect, (response) =>
    HttpServerResponse.setHeaders({
      'content-security-policy': docsCspFor(),
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY'
    })(response)
  )
).layer
