import { choice, group, milliseconds, secret, text, flag, type ValueOf } from './field.ts'

const DEV_HEADERS = 'authorization=edgy-dev-ingestion-key'

export const observabilityConfig = group(
  {
    metricsEnabled: flag('METRICS_ENABLED', false, 'Expose Prometheus metrics at /metrics'),
    sdkDisabled: flag('OTEL_SDK_DISABLED', false, 'Disable trace and metric export'),
    endpoint: text(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318',
      'OTLP/HTTP collector URL'
    ),
    headers: secret('OTEL_EXPORTER_OTLP_HEADERS', DEV_HEADERS, 'OTLP request headers'),
    serviceName: text('OTEL_SERVICE_NAME', 'edgy', 'Service name attached to telemetry'),
    exportInterval: milliseconds('OTEL_EXPORT_INTERVAL', 5_000, 'Telemetry export interval', 1),
    compression: choice(
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      ['gzip', 'none'],
      'gzip',
      'OTLP compression'
    )
  },
  'Observability'
)

export const telemetryEnabled = (config: ValueOf<typeof observabilityConfig>): boolean =>
  !config.sdkDisabled && config.endpoint !== ''
