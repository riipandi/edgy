import { Duration, Effect, Layer, Redacted } from 'effect'
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

/**
 * Parses `OTEL_EXPORTER_OTLP_HEADERS` (`key=value,key2=value2`, the OpenTelemetry
 * format). A value may itself contain `=` (base64 tokens do), so only the first one
 * splits; percent-encoding is decoded as the specification asks. Entries without a
 * key are ignored.
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
 * One id per process, so several instances of the same service stay distinguishable.
 * Created on first use, not at import: a Worker may not generate random values while its
 * module loads (workerd refuses it with "Disallowed operation called within global scope").
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
  // The last flush at shutdown. Effect's default is longer; with the collector down it made every
  // command (a `--help` included) take 3 s to exit. A healthy collector answers well within this.
  shutdownTimeout: Duration.seconds(1)
})

const signalUrl = (config: ObservabilityConfig, signal: 'traces' | 'metrics' | 'logs'): string =>
  `${config.otlpEndpoint.replace(/\/+$/, '')}/v1/${signal}`

/**
 * Trace and metric export over OTLP/HTTP with JSON bodies (no gRPC, no protobuf
 * dependency), plus the `Flusher` that drains every exporter on demand.
 *
 * Export never touches a request: spans and metric updates are buffered in memory and
 * sent by a background fiber every `OTEL_EXPORT_INTERVAL`, or when the batch fills. An
 * exporter whose collector fails switches itself off for 60 seconds and drops its
 * buffer, so a telemetry outage costs a gap in the data, not latency or memory. On
 * shutdown each exporter flushes within its own timeout (the scope finalizer), which is
 * why the layer sits in `CoreLayer`, flushed after the server has stopped. A Worker has
 * no shutdown, so it calls `Flusher.flush` from `waitUntil` after each request.
 *
 * With telemetry off (`OTEL_SDK_DISABLED`, or no endpoint) only the `Flusher` is provided, and flushing it is a no-op.
 */
export const TelemetryLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { observability } = yield* ConfigService
    if (!telemetryEnabled(observability)) return OtlpExporter.layerFlusher

    const options = exportOptions(observability)
    return Layer.mergeAll(
      OtlpTracer.layer({ ...options, url: signalUrl(observability, 'traces') }),
      OtlpMetrics.layer({ ...options, url: signalUrl(observability, 'metrics') })
    ).pipe(Layer.provide(OtlpSerialization.layerJson))
  })
)

/** Longest one export request may take. */
const EXPORT_TIMEOUT = '5 seconds'

/**
 * The `fetch`-based `HttpClient`, with a deadline on every request. Effect's exporter has none of its
 * own: a collector that accepts the connection and never answers leaves each export waiting
 * forever, and since a stall is not an error the exporter's pause (60 s after a failure) never
 * starts, so another export fiber, holding a batch, piles up every interval. With the deadline a
 * stall becomes a failure, which pauses the exporter and drops its buffer.
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
 * Everything telemetry needs, ready to provide: `fetch`-based `HttpClient` (the same on
 * Node and Workers), JSON serialization, the exporters of {@link TelemetryLayer} and
 * their shared `Flusher`. Composition roots build this once and give it both to the
 * rest of the application and to the logger, so the OTLP log sink and the tracer share
 * one `Flusher` and a single `flush` drains all three signals.
 */
export const TelemetryRuntimeLayer = TelemetryLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(ExportHttpClient, OtlpSerialization.layerJson))
)

/**
 * The OTLP log sink, for `LOG_TRANSPORT` containing `otlp`. It is a logger like the
 * console and file sinks, so every line also goes to them when they are selected.
 */
export const makeOtlpLogSink = Effect.gen(function* () {
  const { observability } = yield* ConfigService
  return yield* OtlpLogger.make({
    ...exportOptions(observability),
    url: signalUrl(observability, 'logs')
  })
})
