import { it } from '@effect/vitest'
import { Duration, Effect, Layer, Tracer } from 'effect'
import { expect } from 'vite-plus/test'
import { testConfig } from '../../tests/fixtures/config.ts'
import { migratedDatabase } from '../../tests/fixtures/database.ts'
import { RateLimitCounter, RateLimitCounterLayerDatabase } from './rate-limit.ts'

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
