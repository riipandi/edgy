import { Cause, Duration, Effect, Exit, Layer, Redacted, Tracer } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientError } from 'effect/http'
import {
  OtlpExporter,
  OtlpLogger,
  OtlpMetrics,
  OtlpSerialization,
  OtlpTracer
} from 'effect/observability'
import pkg from '../../package.json' with { type: 'json' }
import {
  ConfigService,
  type ObservabilityConfig,
  telemetryEnabled
} from '../kernel/config/service.ts'
import { defineId } from '../kernel/objectids.ts'
import { redactText } from '../kernel/redact.ts'

/**
 * Parses `OTEL_EXPORTER_OTLP_HEADERS` (`key=value,key2=value2`). Only the first `=` splits,
 * since values may contain `=` (base64 tokens do). Percent-encoding is decoded. Entries without
 * a key are ignored.
 */
export const parseOtlpHeaders = (raw: string): Record<string, string> => {
  const decode = (text: string): string => {
    try {
      return decodeURIComponent(text)
    } catch {
      return text
    }
  }

  const headers: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const at = entry.indexOf('=')
    if (at <= 0) continue
    headers[entry.slice(0, at).trim().toLowerCase()] = decode(entry.slice(at + 1).trim())
  }
  return headers
}

/** `inst_…`: one process or Worker isolate (`service.instance.id`). */
const InstanceId = defineId('inst')

/**
 * One id per process, so instances of one service stay distinguishable. Created on first use,
 * not at import: a Worker may not generate random values while its module loads (workerd
 * rejects it with "Disallowed operation called within global scope").
 */
let instanceId: string | undefined
const instance = (): string => (instanceId ??= InstanceId.make())

/** Options every OTLP signal shares, built once from configuration. */
const exportOptions = (config: ObservabilityConfig) => ({
  resource: {
    serviceName: config.serviceName,
    serviceVersion: pkg.version,
    attributes: { 'service.instance.id': instance() }
  },
  headers: parseOtlpHeaders(Redacted.value(config.otlpHeaders)),
  compression: config.compression,
  exportInterval: config.exportInterval,
  // Bounds the last flush at shutdown. Effect's default is longer, and with the collector down
  // every command (even `--help`) took 3 s to exit.
  shutdownTimeout: Duration.seconds(1)
})

const signalUrl = (config: ObservabilityConfig, signal: 'traces' | 'metrics' | 'logs'): string =>
  `${config.otlpEndpoint.replace(/\/+$/, '')}/v1/${signal}`

/**
 * A failed span exports its exception message and stack, which can quote a connection string or
 * a credential just as a log line can. The exit is replaced by one whose error went through
 * `redactText`; an interruption carries no text and passes unchanged.
 */
const redactExit = (exit: Exit.Exit<unknown, unknown>): Exit.Exit<unknown, unknown> => {
  if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return exit
  const [first] = Cause.prettyErrors(exit.cause)
  if (first === undefined) return exit
  const safe = new Error(redactText(first.message))
  safe.name = first.name
  if (first.stack !== undefined) safe.stack = redactText(first.stack)
  return Exit.die(safe)
}

/** The tracer, with every span's exit redacted when it ends. */
export const redactingTracer = (tracer: Tracer.Tracer): Tracer.Tracer =>
  Tracer.make({
    span(options) {
      const span = tracer.span(options)
      const end = span.end.bind(span)
      // Replaced on the instance: a wrapper object would split the lazily minted ids.
      Object.defineProperty(span, 'end', {
        value: (endTime: bigint, exit: Exit.Exit<unknown, unknown>) =>
          end(endTime, redactExit(exit))
      })
      return span
    },
    context: tracer.context
  })

const tracerLayer = (options: Parameters<typeof OtlpTracer.make>[0]) =>
  Layer.effect(Tracer.Tracer, Effect.map(OtlpTracer.make(options), redactingTracer)).pipe(
    Layer.provideMerge(OtlpExporter.layerFlusher)
  )

/**
 * Trace and metric export over OTLP/HTTP with JSON bodies (no gRPC, no protobuf dependency),
 * plus the `Flusher` that drains every exporter on demand.
 *
 * Export never touches a request: spans and metric updates are buffered in memory and sent by a
 * background fiber every `OTEL_EXPORT_INTERVAL`, or when the batch fills. An exporter whose
 * collector fails pauses for 60 seconds and drops its buffer, so an outage costs a gap in the
 * data, not latency or memory. On shutdown, after the server has stopped, each exporter flushes
 * within its own timeout. A Worker has no shutdown, so it calls `Flusher.flush` from `waitUntil`
 * after each request.
 *
 * With telemetry off (`OTEL_SDK_DISABLED`, or no endpoint) only the `Flusher` is provided, and
 * flushing it does nothing.
 */
export const TelemetryLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { observability } = yield* ConfigService
    if (!telemetryEnabled(observability)) return OtlpExporter.layerFlusher

    const options = exportOptions(observability)
    return Layer.mergeAll(
      tracerLayer({ ...options, url: signalUrl(observability, 'traces') }),
      OtlpMetrics.layer({ ...options, url: signalUrl(observability, 'metrics') })
    ).pipe(Layer.provide(OtlpSerialization.layerJson))
  })
)

/** Longest one export request may take. */
const EXPORT_TIMEOUT = '5 seconds'

/**
 * The `fetch`-based `HttpClient`, with a deadline on every request. Effect's exporter has none:
 * a collector that accepts the connection and never answers would hang each export forever. A
 * stall is not an error, so the exporter's 60-second pause never starts, and export fibers
 * holding batches pile up every interval. With the deadline a stall becomes a failure, which
 * pauses the exporter and drops its buffer.
 */
export const ExportHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(HttpClient.HttpClient, (client) =>
    HttpClient.transform(client, (response, request) =>
      Effect.timeoutOrElse(response, {
        duration: EXPORT_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                description: 'export timed out'
              })
            })
          )
      })
    )
  )
).pipe(Layer.provide(FetchHttpClient.layer))

/**
 * Everything telemetry needs, ready to provide: the `fetch`-based `HttpClient` (the same on Node
 * and Workers), JSON serialization, the exporters of {@link TelemetryLayer} and their shared
 * `Flusher`. Build it once and give it to both the application and the logger, so the OTLP log
 * sink and the tracer share one `Flusher` and a single `flush` drains all three signals.
 */
export const TelemetryRuntimeLayer = TelemetryLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(ExportHttpClient, OtlpSerialization.layerJson))
)

/**
 * The OTLP log sink, selected by `LOG_TRANSPORT` containing `otlp`. It is a logger like the
 * console and file sinks, so the other selected sinks still get every line.
 */
export const makeOtlpLogSink = Effect.gen(function* () {
  const { observability } = yield* ConfigService
  return yield* OtlpLogger.make({
    ...exportOptions(observability),
    url: signalUrl(observability, 'logs')
  })
})
