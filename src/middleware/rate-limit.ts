import { Clock, Duration, Effect, Layer } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { AppConfig } from '#/kernel/config/config.ts'

type Window = { readonly startedAt: number; count: number }

const windows = new Map<string, Window>()

// Counters reset when their configured window expires.
const WINDOW_MS = 60_000
const MAX_CLIENTS = 10_000

const windowFor = (
  clientWindows: Map<string, Window>,
  key: string,
  now: number,
  windowMs: number
): Window => {
  const existing = clientWindows.get(key)
  if (existing !== undefined && now - existing.startedAt < windowMs) return existing
  if (clientWindows.size >= MAX_CLIENTS) {
    for (const [candidate, window] of clientWindows) {
      if (now - window.startedAt >= windowMs || clientWindows.size >= MAX_CLIENTS)
        clientWindows.delete(candidate)
      if (clientWindows.size < MAX_CLIENTS) break
    }
  }
  const fresh = { startedAt: now, count: 0 }
  clientWindows.set(key, fresh)
  return fresh
}

// Consumes one slot for the key and reports the verdict with the standard
// RateLimit-* headers. Reads the clock through the Effect Clock service so
// tests can drive it with TestClock.
export const checkRateLimit = (
  key: string,
  max: number,
  windowMs = WINDOW_MS,
  clientWindows = windows
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const window = windowFor(clientWindows, key, now, windowMs)
    window.count += 1
    const reset = Math.ceil((window.startedAt + windowMs - now) / 1000)
    const headers = {
      'ratelimit-limit': String(max),
      'ratelimit-reset': String(reset),
      'ratelimit-remaining': window.count > max ? '0' : String(max - window.count)
    }
    return { allowed: window.count <= max, headers }
  })

// Standard rate limit headers (draft IETF: RateLimit-*). Route-scoped: only
// the route layers this is provided to are limited, so pages and static
// assets stay unlimited. AppConfig is read when the route layer builds; the
// middleware closure closes over the resolved settings.
export const rateLimit = Layer.unwrap(
  Effect.map(AppConfig, (config) => {
    const { rateLimitEnabled, rateLimitMax, rateLimitWindow } = config.security
    if (!rateLimitEnabled) return Layer.empty
    const clientWindows = new Map<string, Window>()
    return HttpRouter.middleware((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const key = request.remoteAddress._tag === 'Some' ? request.remoteAddress.value : 'local'
        const verdict = yield* checkRateLimit(
          key,
          rateLimitMax,
          Duration.toMillis(rateLimitWindow),
          clientWindows
        )
        if (!verdict.allowed) {
          const retryAfter = Math.max(1, Number(verdict.headers['ratelimit-reset']))
          return HttpServerResponse.setStatus(429)(
            HttpServerResponse.text('Too Many Requests')
          ).pipe(
            HttpServerResponse.setHeaders({
              ...verdict.headers,
              'retry-after': String(retryAfter)
            })
          )
        }
        const response = yield* effect
        return HttpServerResponse.setHeaders(verdict.headers)(response)
      })
    ).layer
  })
)
