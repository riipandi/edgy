import { Effect, Layer } from 'effect'
import { AppConfig } from '../kernel/config/app-config.ts'

// Effect 4 ships the in-process tracer. A remote OpenTelemetry exporter is
// left off while OTEL_SDK_DISABLED is set, which is the e2e default.
export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    if (!config.otelDisabled) {
      yield* Effect.logInfo('tracing stays in-process; set OTEL_SDK_DISABLED=true to silence this')
    }
    return Layer.empty
  })
)
