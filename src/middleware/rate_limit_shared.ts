import { Duration, Effect, Exit } from 'effect'
import { RateLimiter } from 'effect/persistence'
import type { RateCheck } from './rate_limit.ts'

/**
 * A {@link RateCheck} backed by Effect's `RateLimiter` over a shared store (Redis or
 * Valkey), so every instance counts against the same allowance: `RATE_LIMIT_MAX`
 * becomes the global limit instead of a per-process one.
 *
 * **It fails open, and fast.** A rate limiter protects the service; refusing every request
 * because the store is down would turn a Redis outage into an API outage. Two guards keep
 * the outage from also making every request slow, which is what a hung Redis does (the
 * client waits seconds before giving up):
 *
 * - each store call has a `timeout`; past it the request goes through, and
 * - after any store failure the store is bypassed for `cooldown`, so the requests that
 *   follow do not each pay the timeout. When the cooldown ends one request tries the store
 *   again; if it answers, counting resumes.
 *
 * Only a genuine "limit exceeded" refuses. Every bypass is reported once through `warn`.
 */
export const makeSharedRateCheck = (options: {
  readonly limiter: RateLimiter.RateLimiter
  readonly max: number
  readonly window: Duration.Duration
  readonly warn: (message: string, cause: unknown) => void
  /** Longest a store call may take before the request is let through. */
  readonly timeout?: Duration.Input
  /** How long the store is skipped after a failure. */
  readonly cooldown?: Duration.Input
  /** Clock for the cooldown; tests replace it. */
  readonly now?: () => number
}): RateCheck => {
  const windowMs = Duration.toMillis(options.window)
  const timeout = options.timeout ?? '250 millis'
  const cooldownMs = Duration.toMillis(Duration.fromInputUnsafe(options.cooldown ?? '10 seconds'))
  const now = options.now ?? Date.now
  let bypassUntil = 0

  const passThrough = () => ({
    allowed: true,
    limit: options.max,
    remaining: options.max,
    resetAt: now() + windowMs
  })

  const bypass = (message: string, cause: unknown) => {
    bypassUntil = now() + cooldownMs
    options.warn(message, cause)
    return passThrough()
  }

  return async (key) => {
    if (now() < bypassUntil) return passThrough()

    const exit = await Effect.runPromiseExit(
      options.limiter
        .consume({
          algorithm: 'fixed-window',
          onExceeded: 'fail',
          window: options.window,
          limit: options.max,
          key
        })
        .pipe(Effect.timeoutOption(timeout))
    )

    if (Exit.isSuccess(exit)) {
      if (exit.value._tag === 'None') {
        return bypass('Rate limit store timed out; letting requests through for a while', 'timeout')
      }
      const { limit, remaining, resetAfter } = exit.value.value
      return { allowed: true, limit, remaining, resetAt: now() + Duration.toMillis(resetAfter) }
    }

    const failure = exit.cause.reasons.find((reason) => reason._tag === 'Fail')
    const error = failure?._tag === 'Fail' ? failure.error : undefined
    if (
      error instanceof RateLimiter.RateLimiterError &&
      error.reason._tag === 'RateLimitExceeded'
    ) {
      const { limit, remaining, retryAfter } = error.reason
      return { allowed: false, limit, remaining, resetAt: now() + Duration.toMillis(retryAfter) }
    }

    return bypass('Rate limit store unavailable; letting requests through for a while', exit.cause)
  }
}
