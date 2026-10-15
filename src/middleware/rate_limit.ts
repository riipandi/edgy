import { Duration } from 'effect'
import { definePlugin, getRequestIP, type H3Event, HTTPError } from 'h3'
import type { ApiRateLimit } from '../kernel/http/envelope.ts'

export interface RateLimitOptions {
  /** Requests allowed per client per window; `0` or less disables the limiter. */
  readonly max: number
  readonly window: Duration.Duration
  /** Read the client address from proxy headers instead of the socket. */
  readonly trustProxy: boolean
}

declare module 'h3' {
  interface H3EventContext {
    /** Set by {@link rateLimit}; reported in the envelope's `metadata.rate_limit`. */
    rateLimit?: ApiRateLimit
  }
}

interface Bucket {
  count: number
  resetAt: number
}

/** Upper bound on tracked clients, so a flood of addresses cannot grow memory without limit. */
const MAX_TRACKED_CLIENTS = 50_000

/**
 * Client address for the bucket key. Proxy headers are client-controlled unless
 * a proxy we trust overwrites them, so they are read only with `trustProxy`
 * (`CF-Connecting-IP` on Cloudflare, `X-Forwarded-For` elsewhere).
 */
const clientOf = (event: H3Event, trustProxy: boolean): string => {
  if (trustProxy) {
    const cloudflare = event.req.headers.get('cf-connecting-ip')
    if (cloudflare) return cloudflare
  }
  return getRequestIP(event, { xForwardedFor: trustProxy }) ?? 'unknown'
}

/**
 * Fixed-window rate limiter, one bucket per client address.
 *
 * The state lives in the memory of the process (or Worker isolate) that serves
 * the request, so with several instances each enforces its own limit. That is
 * enough to blunt abuse from one client; a strict global quota needs a shared
 * store, which this deliberately does not add.
 *
 * Every response under the limiter carries `x-ratelimit-limit`,
 * `x-ratelimit-remaining` and `x-ratelimit-reset`, and the same values reach the
 * success envelope. An exhausted bucket answers `429` with `retry-after`.
 * Register it on the API group, not globally: probes and `/.well-known` must stay
 * reachable.
 */
export const rateLimit = definePlugin<RateLimitOptions>((app, options) => {
  if (options.max <= 0) return

  const windowMs = Duration.toMillis(options.window)
  const buckets = new Map<string, Bucket>()
  let nextSweep = Date.now() + windowMs

  const sweep = (now: number): void => {
    if (now < nextSweep && buckets.size < MAX_TRACKED_CLIENTS) return
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
    // Still full of live buckets: drop the oldest entries (Map keeps insertion order).
    for (const key of buckets.keys()) {
      if (buckets.size < MAX_TRACKED_CLIENTS) break
      buckets.delete(key)
    }
    nextSweep = now + windowMs
  }

  app.use((event, next) => {
    const now = Date.now()
    sweep(now)

    const key = clientOf(event, options.trustProxy)
    let bucket = buckets.get(key)
    if (bucket === undefined || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    const remaining = Math.max(0, options.max - bucket.count)
    const info: ApiRateLimit = {
      limit: options.max,
      remaining,
      reset: Math.ceil(bucket.resetAt / 1000)
    }
    event.context.rateLimit = info

    const headers: Record<string, string> = {
      'x-ratelimit-limit': String(info.limit),
      'x-ratelimit-remaining': String(info.remaining),
      'x-ratelimit-reset': String(info.reset)
    }
    for (const [name, value] of Object.entries(headers)) {
      event.res.headers.set(name, value)
      event.res.errHeaders.set(name, value)
    }

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      event.res.errHeaders.set('retry-after', String(retryAfter))
      throw new HTTPError({ status: 429, message: 'Too many requests' })
    }

    return next()
  })
})
