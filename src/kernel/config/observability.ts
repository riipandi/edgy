import { choice, duration, flag, group, ratio, secret, text, type ValueOf } from './field.ts'

/**
 * Operational endpoints and telemetry export. Telemetry is OTLP over HTTP/JSON (no
 * gRPC), sent to any OpenTelemetry collector — ClickStack/HyperDX in development.
 * It is off until `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 */
export const observabilityConfig = group(
  {
    metricsEnabled: flag(
      'METRICS_ENABLED',
      false,
      'Serve Prometheus metrics at GET /metrics (unauthenticated: expose only on a private network)'
    ),
    otlpEndpoint: text(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      '',
      'OTLP/HTTP collector base URL, e.g. http://localhost:4318; empty turns trace and metric export off'
    ),
    otlpHeaders: secret(
      'OTEL_EXPORTER_OTLP_HEADERS',
      'Headers sent with every export as key=value pairs separated by commas, e.g. authorization=<ingestion key>'
    ),
    serviceName: text('OTEL_SERVICE_NAME', 'edgy', 'Service name attached to every signal'),
    exportInterval: duration(
      'OTEL_EXPORT_INTERVAL',
      '5 seconds',
      'How often buffered traces, metrics and logs are sent'
    ),
    compression: choice(
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      ['gzip', 'none'],
      'gzip',
      'Compression of export requests'
    ),
    sampleRatio: ratio(
      'OTEL_TRACES_SAMPLE_RATIO',
      1,
      "Fraction of requests whose trace is recorded (1 = all); a caller's sampled traceparent is always honoured"
    )
  },
  { title: 'Observability' }
)

export type ObservabilityConfig = ValueOf<typeof observabilityConfig>
