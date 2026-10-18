import { Effect, Layer } from 'effect'
import * as Headers from 'effect/http/Headers'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { AppConfig } from '../kernel/config/app-config.ts'

type Window = { readonly startedAt: number; count: number }

const windows = new Map<string, Window>()

// Fixed 60-second window. The counter resets when Date.now() passes the
// window's end, so RateLimit-Reset carries the seconds left in the window.
const WINDOW_MS = 60_000

const windowFor = (key: string, now: number): Window => {
  const existing = windows.get(key)
  if (existing !== undefined && now - existing.startedAt < WINDOW_MS) return existing
  const fresh = { startedAt: now, count: 0 }
  windows.set(key, fresh)
  return fresh
}

// Standard rate limit headers (draft IETF: RateLimit-*). Route-scoped: only
// the route layers this is provided to are limited, so pages and static
// assets stay unlimited. AppConfig is read when the route layer builds; the
// middleware closure closes over the resolved max.
export const rateLimit = Layer.unwrap(
  Effect.map(AppConfig, (config) => {
    const max = config.rateLimitMax
    return HttpRouter.middleware((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const forwarded = Headers.get(request.headers, 'x-forwarded-for')
        const key = forwarded._tag === 'Some' ? forwarded.value : 'local'
        const now = Date.now()
        const window = windowFor(key, now)
        window.count += 1
        const reset = Math.ceil((window.startedAt + WINDOW_MS - now) / 1000)
        const limitHeaders = {
          'ratelimit-limit': String(max),
          'ratelimit-reset': String(reset)
        }
        if (window.count > max) {
          return HttpServerResponse.setStatus(429)(
            HttpServerResponse.text('Too Many Requests')
          ).pipe(HttpServerResponse.setHeaders({ ...limitHeaders, 'ratelimit-remaining': '0' }))
        }
        const response = yield* effect
        return HttpServerResponse.setHeaders({
          ...limitHeaders,
          'ratelimit-remaining': String(max - window.count)
        })(response)
      })
    ).layer
  })
)
