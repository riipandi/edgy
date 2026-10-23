import { it } from '@effect/vitest'
import { Effect, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { sampleRuntime } from './runtime-metrics.ts'

it.effect('records runtime gauges as absolute values', () =>
  Effect.gen(function* () {
    yield* sampleRuntime

    const heap = yield* Metric.value(
      Metric.gauge('v8js.memory.heap.used', { description: 'V8 heap used, bytes' })
    )
    // A gauge reports the last sample, so the value is a plausible byte count
    // for a running process rather than an accumulation across samples.
    expect(heap.value).toBeGreaterThan(0)
    expect(heap.value).toBeLessThan(8 * 1024 ** 3)
  })
)
