import { Duration } from 'effect'
import { definePlugin, type H3Event, HTTPError, type Middleware } from 'h3'
import type { ApiRateLimit } from '../kernel/http/envelope.ts'

/** Outcome of counting one request against a client's allowance. */
export interface RateDecision {
  readonly allowed: boolean
  readonly limit: number
  /** What is left. A store that only answers yes or no leaves it out. */
  readonly remaining?: number
  /** When the window ends, in epoch milliseconds. */
  readonly resetAt: number
}

/**
 * Counts one request for `key` and says whether it may proceed. May return synchronously
 * (in-memory counter) or a promise (shared store). The plugin accepts both, so the memory
 * path does not await needlessly.
 */
export type RateCheck = (key: string) => RateDecision | Promise<RateDecision>

export interface RateLimitOptions {
  /** How a request is counted: {@link makeMemoryRateCheck} or a shared store's. */
  readonly check: RateCheck
  /** The client's address for a request, which is the key it is counted under. */
  readonly clientOf: (event: H3Event) => string
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
 * Fixed-window counter in this process's memory (or Worker isolate). It is the default: no
 * network hop, no dependency. With several instances each keeps its own counts, so the
 * effective limit is `max` times the instance count. That blunts abuse from one client. Set
 * `RATE_LIMIT_STORE=redis` (Node.js) or `cloudflare` (Workers) when the limit must be shared.
 *
 * Memory is bounded: expired buckets are swept once per window, and past
 * {@link MAX_TRACKED_CLIENTS} the oldest client is dropped for each new one.
 */
export const makeMemoryRateCheck = (options: {
  readonly max: number
  readonly window: Duration.Duration
  /** Clients tracked at once; the default is {@link MAX_TRACKED_CLIENTS}. */
  readonly maxTracked?: number
}): RateCheck => {
  const windowMs = Duration.toMillis(options.window)
  const maxTracked = options.maxTracked ?? MAX_TRACKED_CLIENTS
  const buckets = new Map<string, Bucket>()
  let nextSweep = Date.now() + windowMs

  // A sweep walks the whole map, so it runs at most once per window, not per request.
  const sweep = (now: number): void => {
    if (now < nextSweep) return
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
    nextSweep = now + windowMs
  }

  return (key) => {
    const now = Date.now()
    sweep(now)

    let bucket = buckets.get(key)
    if (bucket === undefined || bucket.resetAt <= now) {
      // Full of live buckets: drop the oldest (a Map iterates in insertion order) in constant
      // time. Under a flood of distinct keys this forgets the oldest clients' counts, the
      // price of bounded memory.
      if (bucket === undefined && buckets.size >= maxTracked) {
        const oldest = buckets.keys().next()
        if (oldest.done !== true) buckets.delete(oldest.value)
      }
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    return {
      allowed: bucket.count <= options.max,
      limit: options.max,
      remaining: Math.max(0, options.max - bucket.count),
      resetAt: bucket.resetAt
    }
  }
}

/** The limiter as one middleware, for a route that sits outside a group (`{ middleware: [...] }`). */
export const rateLimitMiddleware =
  (options: RateLimitOptions): Middleware =>
  async (event, next) => {
    const decision = await options.check(options.clientOf(event))

    const info: ApiRateLimit = {
      limit: decision.limit,
      ...(decision.remaining === undefined ? {} : { remaining: decision.remaining }),
      reset: Math.ceil(decision.resetAt / 1000)
    }
    event.context.rateLimit = info

    const headers: Record<string, string> = {
      'x-ratelimit-limit': String(info.limit),
      ...(info.remaining === undefined ? {} : { 'x-ratelimit-remaining': String(info.remaining) }),
      'x-ratelimit-reset': String(info.reset)
    }
    for (const [name, value] of Object.entries(headers)) {
      event.res.headers.set(name, value)
      event.res.errHeaders.set(name, value)
    }

    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000))
      event.res.errHeaders.set('retry-after', String(retryAfter))
      throw new HTTPError({ status: 429, message: 'Too many requests' })
    }

    return next()
  }

/**
 * Rate limiter plugin: one allowance per client address, counted by `options.check`.
 *
 * Every response under the limiter carries `x-ratelimit-limit`, `x-ratelimit-remaining` and
 * `x-ratelimit-reset`, and the same values reach the success envelope. An exhausted allowance
 * answers `429` with `retry-after`.
 *
 * Register it on the API group, not globally, so probes and `/.well-known` stay reachable.
 * Whether it is registered at all is `RATE_LIMIT_ENABLED`, decided by the caller.
 */
export const rateLimit = definePlugin<RateLimitOptions>((app, options) => {
  app.use(rateLimitMiddleware(options))
})
