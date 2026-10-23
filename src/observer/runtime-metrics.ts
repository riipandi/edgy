import { Duration, Effect, Layer, Metric, Schedule } from 'effect'
import { monitorEventLoopDelay, performance, PerformanceObserver } from 'node:perf_hooks'
import { getHeapSpaceStatistics, getHeapStatistics } from 'node:v8'

// Node runtime gauges, named to match the semantic conventions the Node.js
// OpenTelemetry instrumentation uses, so a collector or dashboard written
// against that convention reads this service without a mapping layer.
const gauge = (name: string, description: string) => Metric.gauge(name, { description })

const eventLoopDelayP50 = gauge('nodejs.eventloop.delay.p50', 'Event loop delay p50, ms')
const eventLoopDelayP90 = gauge('nodejs.eventloop.delay.p90', 'Event loop delay p90, ms')
const eventLoopDelayP99 = gauge('nodejs.eventloop.delay.p99', 'Event loop delay p99, ms')
const eventLoopUtilization = gauge('nodejs.eventloop.utilization', 'Event loop utilization, 0..1')
const heapUsed = gauge('v8js.memory.heap.used', 'V8 heap used, bytes')
// The ceiling the collector may grow to, not the currently committed heap;
// reporting heapTotal here would make the gap to the ceiling look like headroom
// the process does not have.
const heapLimit = gauge('v8js.memory.heap.limit', 'V8 heap size limit, bytes')
const rss = gauge('process.memory.rss', 'Resident set size, bytes')
const externalMemory = gauge('process.memory.external', 'Memory held outside the V8 heap, bytes')
const uptime = gauge('process.uptime', 'Seconds since the process started')
const cpuUtilization = gauge('process.cpu.utilization', 'Process CPU utilization, 0..1')
const eventLoopTime = Metric.counter('nodejs.eventloop.time', {
  description: 'Event loop busy time, seconds',
  incremental: true
})

// One series per heap space (new_space, old_space, ...), so the dashboard can
// show which space grows instead of a single total.
const heapSpaceSize = Metric.gauge('v8js.memory.heap.space.physical_size', {
  description: 'V8 heap space physical size, bytes'
})

// GC pause time, split by the collector's own kinds (minor, major, incremental,
// weakcb). A rising major-GC share is what a heap under pressure looks like.
const gcDuration = Metric.counter('v8js.gc.duration', {
  description: 'Garbage collection time, seconds',
  incremental: true
})

// 20 ms resolution keeps the histogram cheap while still showing stalls.
const eventLoop = monitorEventLoopDelay({ resolution: 20 })

const nanosToMillis = (nanos: number) => nanos / 1e6

let lastCpu = process.cpuUsage()
let lastSampleAt = process.hrtime.bigint()
let lastUtilization = performance.eventLoopUtilization()

// Index matches the constants Node exposes on `perf_hooks.constants`.
const GC_KINDS: Record<number, string> = {
  1: 'minor',
  2: 'major',
  4: 'incremental',
  8: 'weakcb'
}

// GC entries arrive between samples, so they are buffered and drained on each
// tick rather than reported from inside the observer callback.
let pendingGc = new Map<string, number>()

const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    const kind = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail?.kind
    const name = GC_KINDS[kind ?? -1] ?? 'unknown'
    pendingGc.set(name, (pendingGc.get(name) ?? 0) + entry.duration / 1000)
  }
})

// Gauges are absolute values, so every sample overwrites the previous one
// instead of accumulating. CPU and event loop utilization are measured over the
// interval since the previous sample, so the reported share matches the window.
export const sampleRuntime = Effect.gen(function* () {
  const now = process.hrtime.bigint()
  const elapsedMicros = Number(now - lastSampleAt) / 1e3
  const cpu = process.cpuUsage(lastCpu)
  lastCpu = process.cpuUsage()
  lastSampleAt = now

  // cpuUsage reports microseconds; utilization is the share of one core.
  const busyRatio = elapsedMicros > 0 ? (cpu.user + cpu.system) / elapsedMicros : 0
  const memory = process.memoryUsage()
  const utilization = performance.eventLoopUtilization(lastUtilization)
  lastUtilization = performance.eventLoopUtilization()

  yield* Metric.update(eventLoopDelayP50, nanosToMillis(eventLoop.percentile(50)))
  yield* Metric.update(eventLoopDelayP90, nanosToMillis(eventLoop.percentile(90)))
  yield* Metric.update(eventLoopDelayP99, nanosToMillis(eventLoop.percentile(99)))
  yield* Metric.update(eventLoopUtilization, utilization.utilization)
  yield* Metric.update(heapUsed, memory.heapUsed)
  yield* Metric.update(heapLimit, getHeapStatistics().heap_size_limit)
  yield* Metric.update(rss, memory.rss)
  yield* Metric.update(externalMemory, memory.external)
  yield* Metric.update(uptime, process.uptime())
  yield* Metric.update(cpuUtilization, Math.min(1, Math.max(0, busyRatio)))
  yield* Metric.update(eventLoopTime, utilization.utilization * (elapsedMicros / 1e6))

  for (const space of getHeapSpaceStatistics()) {
    yield* Metric.update(
      Metric.withAttributes(heapSpaceSize, { space: space.space_name }),
      space.physical_space_size
    )
  }

  for (const [kind, seconds] of pendingGc) {
    yield* Metric.update(Metric.withAttributes(gcDuration, { kind }), seconds)
  }
  pendingGc = new Map()

  eventLoop.reset()
})

// Samples on a fixed interval for as long as the layer is alive. The histogram
// and the GC observer are enabled and disabled with the layer so nothing is
// measured once the server has stopped.
export const RuntimeMetricsLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        eventLoop.enable()
        gcObserver.observe({ entryTypes: ['gc'] })
      }),
      () =>
        Effect.sync(() => {
          eventLoop.disable()
          gcObserver.disconnect()
        })
    )
    yield* sampleRuntime.pipe(
      Effect.repeat(Schedule.spaced(Duration.seconds(10))),
      Effect.forkScoped
    )
  })
)
