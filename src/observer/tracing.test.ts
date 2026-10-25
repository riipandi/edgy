import { Effect, Layer, Redacted } from 'effect'
import { expect, it } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { config } from '../../tests/fixtures/config.ts'
import { TelemetryRuntimeLayer } from './tracing.ts'

const observability = (over: Partial<AppConfigShape['observability']>): Layer.Layer<AppConfig> =>
  Layer.succeed(AppConfig, { ...config, observability: { ...config.observability, ...over } })

const build = (over: Partial<AppConfigShape['observability']>) =>
  Effect.runPromise(
    Effect.asVoid(
      Effect.scoped(Layer.build(TelemetryRuntimeLayer.pipe(Layer.provide(observability(over)))))
    )
  )

it('builds the local flusher when the SDK is disabled', async () => {
  await expect(build({ sdkDisabled: true })).resolves.toBeUndefined()
})

it('builds the local flusher when no endpoint is configured', async () => {
  await expect(build({ sdkDisabled: false, endpoint: '' })).resolves.toBeUndefined()
})

it('builds the OTLP tracer and metrics with a normalized signal URL and decoded headers', async () => {
  await expect(
    build({
      sdkDisabled: false,
      endpoint: 'http://collector:4318//v1/traces/',
      headers: Redacted.make('authorization=Bearer%20tok, bad, =x, x=tenant one')
    })
  ).resolves.toBeUndefined()
})
