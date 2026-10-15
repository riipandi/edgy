import { makeFailOpenGate } from '../kernel/fail_open.ts'
import type { RateCheck } from './rate_limit.ts'

/**
 * The part of Cloudflare's Rate Limiting binding this code uses
 * (`ratelimits` in `wrangler.jsonc`). It answers yes or no for a key; the allowance and
 * the period (10 or 60 seconds) are declared in the Wrangler configuration, not asked for.
 */
export interface RateLimitBinding {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>
}

/** Structural check for a binding found in the Worker's `env` (an object with `limit`). */
export const isRateLimitBinding = (value: unknown): value is RateLimitBinding =>
  typeof value === 'object' &&
  value !== null &&
  'limit' in value &&
  typeof value.limit === 'function'

/**
 * A {@link RateCheck} over a Workers Rate Limiting binding.
 *
 * The binding counts per Cloudflare location and is eventually consistent, so it blunts
 * abuse rather than enforcing an exact global quota. It does not report what is left of the
 * allowance, so decisions carry `limit` (`RATE_LIMIT_MAX`, which must mirror the binding's
 * `limit`) and the window's end, but no `remaining`; a refusal sets `retry-after`, from
 * `windowMs`, which should equal the binding's `period`.
 *
 * It fails open like the other stores: a call that throws or takes longer than `timeout`
 * lets the request through, and the binding is skipped for `cooldown` so the requests that
 * follow do not each pay for the outage. One warning per bypass.
 */
export const makeBindingRateCheck = (options: {
  readonly binding: RateLimitBinding
  /** Reported as the allowance; the binding itself does not say. */
  readonly limit: number
  /** Used only to tell a refused client when to come back, in milliseconds. */
  readonly windowMs: number
  readonly warn: (message: string, cause: unknown) => void
  readonly timeoutMs?: number
  readonly cooldownMs?: number
  /** Clock for the cooldown; tests replace it. */
  readonly now?: () => number
}): RateCheck => {
  const timeoutMs = options.timeoutMs ?? 250
  const gate = makeFailOpenGate({ cooldownMs: options.cooldownMs ?? 10_000, probeMs: timeoutMs })
  const now = options.now ?? Date.now

  const decide = (allowed: boolean) => ({
    allowed,
    limit: options.limit,
    resetAt: now() + options.windowMs
  })

  return async (key) => {
    const entry = gate.enter(now())
    if (!entry.allowed) return decide(true)

    const bypass = (cause: unknown) => {
      if (gate.failed(now(), entry.probe)) {
        options.warn('Rate limit binding unavailable; letting requests through for a while', cause)
      }
      return decide(true)
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })

    try {
      const outcome = await Promise.race([options.binding.limit({ key }), timedOut])
      if (outcome === 'timeout') return bypass('timeout')
      gate.succeeded()
      return decide(outcome.success)
    } catch (cause) {
      return bypass(cause)
    } finally {
      clearTimeout(timer)
    }
  }
}
