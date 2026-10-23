import { Duration, Effect, Layer, Metric, Schedule } from 'effect'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

// Node runtime gauges, named to match the semantic conventions the Node.js
// OpenTelemetry instrumentation uses, so a collector or dashboard written
// against that convention reads this service without a mapping layer.
const gauge = (name: string, description: string) => Metric.gauge(name, { description })

const eventLoopDelayP50 = gauge('nodejs.eventloop.delay.p50', 'Event loop delay p50, ms')
const eventLoopDelayP90 = gauge('nodejs.eventloop.delay.p90', 'Event loop delay p90, ms')
const eventLoopDelayP99 = gauge('nodejs.eventloop.delay.p99', 'Event loop delay p99, ms')
const eventLoopUtilization = gauge('nodejs.eventloop.utilization', 'Event loop utilization, 0..1')
const heapUsed = gauge('v8js.memory.heap.used', 'V8 heap used, bytes')
const heapLimit = gauge('v8js.memory.heap.limit', 'V8 heap limit, bytes')
const heapSpacePhysicalSize = gauge(
  'v8js.memory.heap.space.physical_size',
  'V8 heap physical size, bytes'
)
const cpuUtilization = gauge('process.cpu.utilization', 'Process CPU utilization, 0..1')
const eventLoopTime = Metric.counter('nodejs.eventloop.time', {
  description: 'Event loop busy time, seconds',
  incremental: true
})

// 20 ms resolution keeps the histogram cheap while still showing stalls.
const eventLoop = monitorEventLoopDelay({ resolution: 20 })

const nanosToMillis = (nanos: number) => nanos / 1e6

let lastCpu = process.cpuUsage()
let lastSampleAt = process.hrtime.bigint()
let lastUtilization = performance.eventLoopUtilization()

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
  yield* Metric.update(heapLimit, memory.heapTotal)
  // The heap's reserved physical size; the dashboard groups by heap space, which
  // this service does not report, so the tile shows the whole heap.
  yield* Metric.update(heapSpacePhysicalSize, memory.heapTotal)
  yield* Metric.update(cpuUtilization, Math.min(1, Math.max(0, busyRatio)))
  yield* Metric.update(eventLoopTime, utilization.utilization * (elapsedMicros / 1e6))
  eventLoop.reset()
})

// Samples on a fixed interval for as long as the layer is alive. The histogram
// is enabled and disabled with the layer so nothing is measured once the server
// has stopped.
export const RuntimeMetricsLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => eventLoop.enable()),
      () => Effect.sync(() => eventLoop.disable())
    )
    yield* sampleRuntime.pipe(
      Effect.repeat(Schedule.spaced(Duration.seconds(10))),
      Effect.forkScoped
    )
  })
)
