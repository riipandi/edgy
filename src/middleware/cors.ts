/**
 * CORS for the API surface. Enabled by default and allows any origin;
 * CORS_ALLOWED_ORIGINS narrows it to absolute origins. Global middleware: the
 * serve command's composition (HttpRouter.serve) has no route scope for a
 * route-scoped middleware layer to attach to.
 */

import { Effect, Types } from 'effect'
import * as HttpMiddleware from 'effect/http/HttpMiddleware'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { AppConfig } from '#/kernel/config/config.ts'

type AppEffect = Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled>

export const corsMiddleware = HttpRouter.middleware(
  Effect.map(AppConfig, (config) => (effect: AppEffect) => {
    if (!config.security.corsEnabled) return effect
    const allowedOrigins = config.security.corsAllowedOrigins
    return HttpMiddleware.cors({
      // Empty list allows any origin: a predicate echoes the caller's
      // Origin, which also keeps credentials valid (the literal `*` cannot).
      allowedOrigins: (origin: string) =>
        allowedOrigins.length === 0 || allowedOrigins.includes(origin),
      allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['accept', 'content-type', 'authorization'],
      credentials: true,
      maxAge: 600
    })(effect) as AppEffect
  }),
  { global: true }
)
