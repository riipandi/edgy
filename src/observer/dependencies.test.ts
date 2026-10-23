import { it } from '@effect/vitest'
import { Effect, Exit, Layer, Metric, Tracer } from 'effect'
import { expect } from 'vite-plus/test'
import { dependencyDuration, withDependencyTelemetry } from './dependencies.ts'

const recordingTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return { spans, tracer }
}

it.effect('records per store and op on success', () =>
  Effect.gen(function* () {
    yield* Effect.succeed(1).pipe(
      withDependencyTelemetry({ store: 'sqlite', op: 'query', span: 'database.query' })
    )
    const series = yield* Metric.value(
      Metric.withAttributes(dependencyDuration, { store: 'sqlite', op: 'query' })
    )
    expect(series.count).toBeGreaterThanOrEqual(1)
  })
)

it.effect('records on failure and keeps the error', () =>
  Effect.gen(function* () {
    const outcome = yield* Effect.fail('boom').pipe(
      withDependencyTelemetry({ store: 'redis', op: 'cache-get', span: 'cache.redis-get' }),
      Effect.exit
    )
    expect(Exit.isFailure(outcome)).toBe(true)
    const series = yield* Metric.value(
      Metric.withAttributes(dependencyDuration, { store: 'redis', op: 'cache-get' })
    )
    expect(series.count).toBeGreaterThanOrEqual(1)
  })
)

it.effect('the outcome and failure attributes annotate the span', () =>
  Effect.gen(function* () {
    const { spans, tracer } = recordingTracer()
    const provided = Layer.succeed(Tracer.Tracer, tracer)
    yield* Effect.succeed({ allowed: true }).pipe(
      withDependencyTelemetry({
        store: 'redis',
        op: 'rate-limit-consume',
        span: 'rate-limit.consume',
        outcome: (value: { allowed: boolean }) => ({
          'limiter.verdict': value.allowed ? 'allowed' : 'rejected'
        })
      }),
      Effect.provide(provided)
    )
    yield* Effect.fail('down').pipe(
      withDependencyTelemetry({
        store: 'redis',
        op: 'rate-limit-consume',
        span: 'rate-limit.redis-consume',
        onFailure: { 'limiter.verdict': 'unavailable' }
      }),
      Effect.exit,
      Effect.provide(provided)
    )

    const consumed = spans.filter((span) => span.name === 'rate-limit.consume')
    expect(consumed).toHaveLength(1)
    expect(consumed[0]!.attributes.get('limiter.verdict')).toBe('allowed')
    expect(consumed[0]!.attributes.get('store')).toBe('redis')

    const failed = spans.filter((span) => span.name === 'rate-limit.redis-consume')
    expect(failed).toHaveLength(1)
    expect(failed[0]!.attributes.get('limiter.verdict')).toBe('unavailable')
  })
)
