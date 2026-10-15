import { describe, expect, it } from '@effect/vitest'
import {
  isRateLimitBinding,
  makeBindingRateCheck,
  type RateLimitBinding
} from './rate_limit_binding.ts'

/** A binding that allows `allowed` calls per key, like a fixed window that never resets. */
const countingBinding = (allowed: number): RateLimitBinding & { calls: () => number } => {
  const seen = new Map<string, number>()
  let calls = 0
  return {
    calls: () => calls,
    limit: async ({ key }) => {
      calls += 1
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      return { success: count <= allowed }
    }
  }
}

describe('isRateLimitBinding', () => {
  it('accepts an object with a limit function and nothing else', () => {
    expect(isRateLimitBinding({ limit: async () => ({ success: true }) })).toBe(true)
    for (const other of [undefined, null, 'RATE_LIMITER', {}, { limit: 1 }]) {
      expect(isRateLimitBinding(other)).toBe(false)
    }
  })
})

describe('binding rate check', () => {
  it('refuses per key once the binding says so, with no allowance figures', async () => {
    const check = makeBindingRateCheck({
      binding: countingBinding(1),
      windowMs: 60_000,
      warn: () => {}
    })

    const first = await check('203.0.113.1')
    expect(first.allowed).toBe(true)
    expect(first.limit).toBeUndefined()
    expect(first.remaining).toBeUndefined()

    const second = await check('203.0.113.1')
    expect(second.allowed).toBe(false)
    expect(second.resetAt).toBeGreaterThan(Date.now())

    expect((await check('203.0.113.2')).allowed).toBe(true)
  })

  it('fails open, warns once, and skips the binding during the cooldown', async () => {
    let clock = 1_000
    const warnings: unknown[] = []
    let healthy = false
    let calls = 0
    const check = makeBindingRateCheck({
      binding: {
        limit: async () => {
          calls += 1
          if (!healthy) throw new Error('binding down')
          return { success: false }
        }
      },
      windowMs: 60_000,
      warn: (_message, cause) => warnings.push(cause),
      cooldownMs: 10_000,
      now: () => clock
    })

    expect((await check('a')).allowed).toBe(true)
    expect((await check('a')).allowed).toBe(true)
    expect(calls).toBe(1)
    expect(warnings).toHaveLength(1)

    healthy = true
    clock += 10_001
    expect((await check('a')).allowed).toBe(false) // counting resumes after the cooldown
    expect(calls).toBe(2)
  })

  it('lets the request through when the binding hangs past the timeout', async () => {
    const warnings: unknown[] = []
    const check = makeBindingRateCheck({
      binding: { limit: () => new Promise(() => {}) },
      windowMs: 60_000,
      warn: (_message, cause) => warnings.push(cause),
      timeoutMs: 20
    })
    expect((await check('a')).allowed).toBe(true)
    expect(warnings).toEqual(['timeout'])
  })
})
