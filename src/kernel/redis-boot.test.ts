import { it } from '@effect/vitest'
import { Effect, Fiber, Logger } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import { awaitRedis } from '#/kernel/redis-boot.ts'

it.effect('retries a late redis until it answers', () =>
  Effect.gen(function* () {
    let attempts = 0
    const acquire = Effect.suspend(() => {
      attempts += 1
      return attempts < 3 ? Effect.fail(new Error('still down')) : Effect.succeed('up')
    })

    const fiber = yield* Effect.forkScoped(awaitRedis(acquire))
    yield* TestClock.adjust('5 seconds')
    const result = yield* Fiber.join(fiber)

    expect(result).toBe('up')
    expect(attempts).toBe(3)
  })
)

it.effect('gives up after the bounded retry window', () =>
  Effect.gen(function* () {
    let attempts = 0
    const acquire = Effect.suspend(() => {
      attempts += 1
      return Effect.fail(new Error('permanently down'))
    })

    const fiber = yield* Effect.forkScoped(awaitRedis(acquire))
    yield* TestClock.adjust('60 seconds')
    const outcome = yield* Fiber.await(fiber)

    expect(outcome._tag).toBe('Failure')
    expect(attempts).toBe(31)
  })
)

it.effect('warns on every failed attempt', () =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const capture = Logger.layer([Logger.make((options) => lines.push(String(options.message)))])

    const fiber = yield* Effect.forkScoped(awaitRedis(Effect.fail(new Error('down')))).pipe(
      Effect.provide(capture)
    )
    yield* TestClock.adjust('60 seconds')
    yield* Effect.ignore(Fiber.await(fiber))

    // One warning per failed attempt, including the initial one.
    expect(lines).toHaveLength(31)
    expect(lines.every((line) => line === 'Redis unreachable at boot; retrying')).toBe(true)
  })
)
