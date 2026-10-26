import { Duration, Effect, Layer, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { OtlpLogger, OtlpMetrics, OtlpExporter } from 'effect/observability'
import { OtlpTracer, OtlpSerialization } from 'effect/observability'
import { AppConfig } from '#/kernel/config/config.ts'

const headersFrom = (raw: string): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const separator = entry.indexOf('=')
    if (separator < 1) continue
    const name = entry.slice(0, separator).trim().toLowerCase()
    const value = entry.slice(separator + 1).trim()
    if (name.length === 0) continue
    try {
      headers[name] = decodeURIComponent(value)
    } catch {
      headers[name] = value
    }
  }
  return headers
}

const signalUrl = (endpoint: string, signal: 'traces' | 'metrics' | 'logs'): string =>
  `${endpoint.replace(/\/+$/, '').replace(/\/v1\/(traces|metrics|logs)$/, '')}/v1/${signal}`

const options = (config: AppConfig['Service']['observability']) => ({
  resource: { serviceName: config.serviceName },
  headers: headersFrom(Redacted.value(config.headers)),
  compression: config.compression,
  exportInterval: config.exportInterval,
  shutdownTimeout: Duration.seconds(1)
})

const dependencies = Layer.merge(OtlpSerialization.layerJson, FetchHttpClient.layer)

export const TelemetryRuntimeLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { observability } = yield* AppConfig
    if (observability.sdkDisabled || observability.endpoint.length === 0)
      return OtlpExporter.layerFlusher

    const common = options(observability)
    return Layer.merge(
      OtlpTracer.layer({ ...common, url: signalUrl(observability.endpoint, 'traces') }),
      OtlpMetrics.layer({ ...common, url: signalUrl(observability.endpoint, 'metrics') })
    )
  })
).pipe(Layer.provideMerge(dependencies))

export const makeOtlpLogSink = Effect.gen(function* () {
  const { observability } = yield* AppConfig
  return yield* OtlpLogger.make({
    ...options(observability),
    url: signalUrl(observability.endpoint, 'logs')
  })
})
