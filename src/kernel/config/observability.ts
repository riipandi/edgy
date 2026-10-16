import { Config, ConfigProvider, Effect, Redacted } from 'effect'
import { choice, flag, group, milliseconds, ratio, secret, text, type ValueOf } from './field.ts'

/** The ingestion key of the development collector (`pnpm compose:up`); known to everyone. */
const DEV_INGESTION_HEADERS = 'authorization=edgy-dev-ingestion-key'

/** Whether a collector URL points at this machine, where the development key is the right one. */
const isLocalCollector = (endpoint: string): boolean => {
  try {
    const { hostname } = new URL(endpoint)
    return ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(hostname)
  } catch {
    return false
  }
}

/**
 * Telemetry is OTLP over HTTP/JSON (no gRPC). The defaults target the local collector of
 * `pnpm compose:up`. Where no collector runs, exporters fail quietly and pause; a deployment
 * without one should set `OTEL_SDK_DISABLED=true` rather than export to localhost.
 */
export const observabilityConfig = group(
  {
    metricsEnabled: flag(
      'METRICS_ENABLED',
      false,
      'Serve Prometheus metrics at GET /metrics (unauthenticated: expose only on a private network)'
    ),
    sdkDisabled: flag(
      'OTEL_SDK_DISABLED',
      false,
      'Turn all telemetry export off (traces, metrics and otlp logs), whatever the endpoint'
    ),
    otlpEndpoint: text(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318',
      'OTLP/HTTP collector base URL; the default is the ClickStack of `pnpm compose:up`'
    ),
    otlpHeaders: secret(
      'OTEL_EXPORTER_OTLP_HEADERS',
      'Headers sent with every export as key=value pairs separated by commas; the default is the development ingestion key of `pnpm compose:up`',
      DEV_INGESTION_HEADERS
    ),
    serviceName: text('OTEL_SERVICE_NAME', 'edgy', 'Service name attached to every signal'),
    exportInterval: milliseconds(
      'OTEL_EXPORT_INTERVAL',
      5000,
      'How often buffered traces, metrics and logs are sent',
      { min: 1 }
    ),
    compression: choice(
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      ['gzip', 'none'],
      'gzip',
      'Compression of export requests'
    ),
    sampleRatio: ratio(
      'OTEL_TRACES_SAMPLE_RATIO',
      0.7,
      "Fraction of requests whose trace is recorded (1 = all); a caller's sampled traceparent is always honoured"
    )
  },
  {
    title: 'Observability',
    // The default key belongs to the local collector. Sent to a remote one it is a mistake (the
    // collector refuses it), and it hands a known key to whoever runs that collector.
    transform: (raw) =>
      !raw.sdkDisabled &&
      raw.otlpEndpoint !== '' &&
      Redacted.value(raw.otlpHeaders) === DEV_INGESTION_HEADERS &&
      !isLocalCollector(raw.otlpEndpoint)
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message:
                  'OTEL_EXPORTER_OTLP_HEADERS is still the development ingestion key, but OTEL_EXPORTER_OTLP_ENDPOINT is not local: set the headers for that collector'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

export type ObservabilityConfig = ValueOf<typeof observabilityConfig>

/** Whether traces and metrics are exported. One definition, so exporters and tracing agree. */
export const telemetryEnabled = (config: ObservabilityConfig): boolean =>
  !config.sdkDisabled && config.otlpEndpoint !== ''
