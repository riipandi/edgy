import { it } from '@effect/vitest'
import { Duration, Effect, Layer, Tracer } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import { testConfig } from '../../tests/fixtures/config.ts'
import { migratedDatabase, unwritableStoreService } from '../../tests/fixtures/database.ts'
import {
  RateLimitCounter,
  RateLimitCounterLayer,
  RateLimitCounterLayerDatabase
} from './rate-limit.ts'

const recorded: Array<Tracer.NativeSpan> = []
const recorder = Layer.succeed(
  Tracer.Tracer,
  Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      recorded.push(span)
      return span
    }
  })
)

const counterLayer = Layer.provideMerge(
  RateLimitCounterLayerDatabase.pipe(Layer.provide(migratedDatabase), Layer.provide(testConfig)),
  recorder
)

it.effect('annotates allowed and rejected verdicts on the consume span', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter
    yield* counter.consume('span-a', 5, Duration.seconds(60))
    yield* counter.consume('span-b', 0, Duration.seconds(60))

    const consumes = recorded.filter((span) => span.name === 'rate-limit.consume')
    const verdicts = consumes.map((span) => span.attributes.get('limiter.verdict'))
    expect(consumes).toHaveLength(2)
    expect(verdicts).toContain('allowed')
    expect(verdicts).toContain('rejected')
    expect(consumes.every((span) => span.attributes.get('store') === 'sqlite')).toBe(true)
  }).pipe(Effect.provide(counterLayer))
)

it.effect('counts keys independently and clamps the remaining budget', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter
    const first = yield* counter.consume('budget-a', 2, Duration.seconds(60))
    expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1 })
    const second = yield* counter.consume('budget-a', 2, Duration.seconds(60))
    expect(second).toMatchObject({ allowed: true, remaining: 0 })
    const third = yield* counter.consume('budget-a', 2, Duration.seconds(60))
    expect(third).toMatchObject({ allowed: false, remaining: 0 })
    expect(third.resetSeconds).toBeGreaterThanOrEqual(1)

    const other = yield* counter.consume('budget-b', 2, Duration.seconds(60))
    expect(other).toMatchObject({ allowed: true, remaining: 1 })
  }).pipe(Effect.provide(counterLayer))
)

it.effect('starts a fresh window after the bucket expires', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter
    yield* counter.consume('windowed', 1, Duration.seconds(60))
    expect((yield* counter.consume('windowed', 1, Duration.seconds(60))).allowed).toBe(false)

    yield* TestClock.adjust('61 seconds')

    const fresh = yield* counter.consume('windowed', 1, Duration.seconds(60))
    expect(fresh).toMatchObject({ allowed: true, remaining: 0 })
  }).pipe(Effect.provide(counterLayer))
)

it.effect('refills gradually instead of resetting all at once', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter
    // limit 3 over 30s: one token every 10s.
    yield* counter.consume('refill', 3, Duration.seconds(30))
    yield* counter.consume('refill', 3, Duration.seconds(30))
    yield* counter.consume('refill', 3, Duration.seconds(30))
    expect((yield* counter.consume('refill', 3, Duration.seconds(30))).allowed).toBe(false)

    // Half a refill interval: still empty, unlike a fixed window's all-or-nothing reset.
    yield* TestClock.adjust('5 seconds')
    expect((yield* counter.consume('refill', 3, Duration.seconds(30))).allowed).toBe(false)

    // A full refill interval: exactly one token back, not the whole bucket.
    yield* TestClock.adjust('5 seconds')
    const refilled = yield* counter.consume('refill', 3, Duration.seconds(30))
    expect(refilled).toMatchObject({ allowed: true, remaining: 0 })
    expect((yield* counter.consume('refill', 3, Duration.seconds(30))).allowed).toBe(false)
  }).pipe(Effect.provide(counterLayer))
)

it.effect('maps a store failure into a RateLimitError', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter.pipe(
      Effect.provide(RateLimitCounterLayerDatabase.pipe(Layer.provide(unwritableStoreService)))
    )
    const failure = yield* Effect.flip(counter.consume('broken', 5, Duration.seconds(60)))
    expect(failure._tag).toBe('RateLimitError')
  })
)

it.effect('routes to the sqlite counter while redis is disabled', () =>
  Effect.gen(function* () {
    const counter = yield* RateLimitCounter.pipe(
      Effect.provide(
        RateLimitCounterLayer.pipe(Layer.provide(migratedDatabase), Layer.provide(testConfig))
      )
    )
    const verdict = yield* counter.consume('selected', 5, Duration.seconds(60))
    expect(verdict.allowed).toBe(true)
    const consumes = recorded.filter((span) => span.name === 'rate-limit.consume')
    expect(consumes.at(-1)?.attributes.get('store')).toBe('sqlite')
  })
)
