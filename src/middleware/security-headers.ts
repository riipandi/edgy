import { Effect } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'

// Response hardening applied to every server response. StyleX ships compiled
// stylesheets, so the CSP allows inline styles (hydration writes style
// attributes) but no inline scripts; the Scalar reference is self-hosted and
// loads only same-origin assets.
const HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
} as const

export const securityHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.map(httpEffect, (response) => HttpServerResponse.setHeaders(HEADERS)(response)),
  { global: true }
)
