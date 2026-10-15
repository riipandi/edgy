import { describe, expect, it, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { RateLimiter } from 'effect/persistence'
import { makeSharedRateCheck } from './rate_limit_shared.ts'

const memoryLimiter = RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))

layer(memoryLimiter)('shared rate check with a store', (scoped) => {
  scoped.effect('counts across callers and refuses past the limit', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimiter.RateLimiter
      const check = makeSharedRateCheck({
        limiter,
        max: 2,
        window: Duration.minutes(1),
        warn: () => {}
      })

      const first = yield* Effect.promise(async () => check('203.0.113.1'))
      expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1 })

      yield* Effect.promise(async () => check('203.0.113.1'))
      const third = yield* Effect.promise(async () => check('203.0.113.1'))
      expect(third.allowed).toBe(false)
      expect(third.resetAt).toBeGreaterThan(Date.now())

      // another client has its own allowance
      const other = yield* Effect.promise(async () => check('203.0.113.2'))
      expect(other.allowed).toBe(true)
    })
  )
})

describe('shared rate check when the store fails', () => {
  it.effect('lets the request through, and says so once, when the store fails', () =>
    Effect.gen(function* () {
      const warnings: string[] = []
      const broken = {
        consume: () =>
          Effect.fail(
            new RateLimiter.RateLimiterError({
              reason: new RateLimiter.RateLimitStoreError({
                message: 'redis is down',
                cause: new Error('ECONNREFUSED')
              })
            })
          )
      } as unknown as RateLimiter.RateLimiter

      const check = makeSharedRateCheck({
        limiter: broken,
        max: 5,
        window: Duration.minutes(1),
        warn: (message) => warnings.push(message)
      })

      const decision = yield* Effect.promise(async () => check('203.0.113.9'))
      expect(decision).toMatchObject({ allowed: true, limit: 5, remaining: 5 })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('letting requests through')
    })
  )
})

describe('shared rate check when the store hangs', () => {
  const hanging = {
    consume: () => Effect.never
  } as unknown as RateLimiter.RateLimiter

  it.effect('gives up after the timeout, then skips the store until the cooldown ends', () =>
    Effect.gen(function* () {
      let clock = 1_000
      let calls = 0
      const counting = {
        consume: (...args: unknown[]) => {
          calls += 1
          return (hanging as any).consume(...args)
        }
      } as unknown as RateLimiter.RateLimiter
      const warnings: string[] = []

      const check = makeSharedRateCheck({
        limiter: counting,
        max: 5,
        window: Duration.minutes(1),
        warn: (message) => warnings.push(message),
        timeout: '20 millis',
        cooldown: '10 seconds',
        now: () => clock
      })

      const first = yield* Effect.promise(async () => check('k'))
      expect(first.allowed).toBe(true)
      expect(calls).toBe(1)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('timed out')

      // inside the cooldown the store is not asked at all, so no timeout is paid
      clock += 5_000
      yield* Effect.promise(async () => check('k'))
      yield* Effect.promise(async () => check('k'))
      expect(calls).toBe(1)
      expect(warnings).toHaveLength(1)

      // after the cooldown one request tries the store again
      clock += 6_000
      yield* Effect.promise(async () => check('k'))
      expect(calls).toBe(2)
    })
  )
})
