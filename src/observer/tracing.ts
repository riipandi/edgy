import { Effect, Layer, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer } from 'effect/observability'
import { AppConfig } from '#/kernel/config/config.ts'

const headersFrom = (raw: string): Record<string, string> =>
  Object.fromEntries(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const separator = entry.indexOf('=')
        return separator < 1 ? ['', ''] : [entry.slice(0, separator), entry.slice(separator + 1)]
      })
      .filter(
        ([key, value]) =>
          key !== undefined && key.length > 0 && value !== undefined && value.length > 0
      )
  )

const signalUrl = (endpoint: string, signal: 'traces' | 'metrics' | 'logs'): string =>
  `${endpoint.replace(/\/+$/, '').replace(/\/v1\/(traces|metrics|logs)$/, '')}/v1/${signal}`

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    const observability = config.observability
    if (observability.sdkDisabled || observability.endpoint.length === 0) return Layer.empty

    const common = {
      resource: { serviceName: observability.serviceName },
      headers: headersFrom(Redacted.value(observability.headers)),
      compression: observability.compression,
      exportInterval: observability.exportInterval
    }
    const dependencies = Layer.merge(OtlpSerialization.layerJson, FetchHttpClient.layer)
    const tracer = OtlpTracer.layer({ ...common, url: signalUrl(observability.endpoint, 'traces') })
    const metrics = OtlpMetrics.layer({
      ...common,
      url: signalUrl(observability.endpoint, 'metrics')
    })
    if (config.logging.transport.includes('otlp')) {
      return Layer.merge(
        Layer.merge(tracer, metrics),
        OtlpLogger.layer({ ...common, url: signalUrl(observability.endpoint, 'logs') })
      ).pipe(Layer.provide(dependencies))
    }
    return Layer.merge(tracer, metrics).pipe(Layer.provide(dependencies))
  })
)
