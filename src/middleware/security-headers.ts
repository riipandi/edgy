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

// HTML responses stream Solid's inline hydration scripts, so they carry a
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

export const securityHeaders = {
  'content-security-policy': cspFor(),
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
} as const

export const applySecurityHeaders = (response: HttpServerResponse.HttpServerResponse) =>
  response.headers['content-security-policy'] === undefined
    ? HttpServerResponse.setHeaders(securityHeaders)(response)
    : response

export const securityHeadersMiddleware = HttpRouter.middleware(
  (httpEffect) => Effect.map(httpEffect, applySecurityHeaders),
  { global: true }
)

export const docsSecurityHeadersMiddleware = HttpRouter.middleware((httpEffect) =>
  Effect.map(httpEffect, (response) =>
    HttpServerResponse.setHeader(response, 'content-security-policy', docsCspFor())
  )
).layer
