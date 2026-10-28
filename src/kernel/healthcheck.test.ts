import { it } from '@effect/vitest'
import { Effect, Exit, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import type { HealthReport } from './healthcheck.ts'
import { runHealthChecks } from './healthcheck.ts'

const reportOf = (outcome: Exit.Exit<HealthReport>) => {
  if (outcome._tag !== 'Success') throw new Error('unexpected health failure')
  return outcome.value
}

it.effect('aggregates up when every check passes', () =>
  Effect.gen(function* () {
    const report = yield* runHealthChecks([
      { name: 'database', check: Effect.void },
      { name: 'cache', check: Effect.void }
    ])
    expect(report.status).toBe('ok')
    expect(report.details.database?.status).toBe('up')
    expect(report.details.cache?.status).toBe('up')
    expect(Object.keys(report.details)).toEqual(['database', 'cache'])
    expect(typeof report.details.database?.timestamp).toBe('string')
    expect(report.details.database?.error).toBeUndefined()
  })
)

it.effect('marks the failing check down and keeps the rest up', () =>
  Effect.gen(function* () {
    const report = yield* runHealthChecks([
      { name: 'database', check: Effect.void },
      { name: 'cache', check: Effect.fail(new Error('connection refused')) }
    ])
    expect(report.status).toBe('unhealthy')
    expect(report.details.database?.status).toBe('up')
    expect(report.details.cache).toMatchObject({
      status: 'down',
      error: 'unavailable'
    })
  })
)

it.effect('marks a hung check down after the shared timeout', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(
      runHealthChecks([{ name: 'database', check: Effect.never }])
    )
    yield* TestClock.adjust('2 seconds')
    const report = reportOf(yield* Fiber.await(fiber))
    expect(report.status).toBe('unhealthy')
    expect(report.details.database).toMatchObject({ status: 'down', error: 'timed out after 2s' })
  })
)

it.effect('a per-check timeout overrides the shared budget', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(
      runHealthChecks([{ name: 'slow', check: Effect.never, timeout: '500 millis' }])
    )
    yield* TestClock.adjust('500 millis')
    const report = reportOf(yield* Fiber.await(fiber))
    expect(report.details.slow).toMatchObject({ status: 'down', error: 'timed out after 500ms' })
  })
)

it.effect('non-error failures still render a message', () =>
  Effect.gen(function* () {
    const report = yield* runHealthChecks([{ name: 'cache', check: Effect.fail('offline') }])
    expect(report.details.cache).toMatchObject({ status: 'down', error: 'unavailable' })
  })
)
