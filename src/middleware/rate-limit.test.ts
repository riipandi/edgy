import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import { checkRateLimit } from './rate-limit.ts'

const program = Effect.gen(function* () {
  const first = yield* checkRateLimit('testclock', 2)
  const second = yield* checkRateLimit('testclock', 2)
  const third = yield* checkRateLimit('testclock', 2)

  expect(first.allowed).toBe(true)
  expect(first.headers).toMatchObject({
    'ratelimit-limit': '2',
    'ratelimit-remaining': '1'
  })
  expect(second.allowed).toBe(true)
  expect(second.headers['ratelimit-remaining']).toBe('0')

  expect(third.allowed).toBe(false)
  expect(third.headers['ratelimit-remaining']).toBe('0')

  // The window has not elapsed yet: still blocked.
  yield* TestClock.adjust('30 seconds')
  expect(yield* checkRateLimit('testclock', 2)).toMatchObject({ allowed: false })

  // Crossing the 60-second window opens a fresh one.
  yield* TestClock.adjust('31 seconds')
  const fresh = yield* checkRateLimit('testclock', 2)
  expect(fresh.allowed).toBe(true)
  expect(fresh.headers['ratelimit-reset']).toBe('60')
})

it.effect('blocks beyond the max and resets after the window', () => program)
