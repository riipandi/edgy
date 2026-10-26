import { it } from '@effect/vitest'
import { Effect, Metric } from 'effect'
import { getHeapStatistics } from 'node:v8'
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

it.effect('reports the heap ceiling rather than the committed heap', () =>
  Effect.gen(function* () {
    yield* sampleRuntime

    const limit = yield* Metric.value(
      Metric.gauge('v8js.memory.heap.limit', { description: 'V8 heap size limit, bytes' })
    )
    const used = yield* Metric.value(
      Metric.gauge('v8js.memory.heap.used', { description: 'V8 heap used, bytes' })
    )

    // The ceiling has to sit above the current usage, which heapTotal would not
    // guarantee once the heap is committed near its limit.
    expect(limit.value).toBe(getHeapStatistics().heap_size_limit)
    expect(limit.value).toBeGreaterThan(used.value)
  })
)

it.effect('reports resident memory and uptime', () =>
  Effect.gen(function* () {
    yield* sampleRuntime

    const rss = yield* Metric.value(
      Metric.gauge('process.memory.rss', { description: 'Resident set size, bytes' })
    )
    const uptime = yield* Metric.value(
      Metric.gauge('process.uptime', { description: 'Seconds since the process started' })
    )

    expect(rss.value).toBeGreaterThan(0)
    expect(uptime.value).toBeGreaterThan(0)
  })
)
