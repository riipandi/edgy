import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Duration, Effect, Redacted } from 'effect'
import { readFileSync } from 'node:fs'
import { renderExample } from './example.ts'
import { appConfig, telemetryEnabled } from './service.ts'

const parse = (env: Record<string, string>) =>
  Effect.runPromise(
    // A Config is yieldable but not an Effect, so it needs the generator.
    // oxlint-disable-next-line effecttsgo/unnecessary-effect-gen
    Effect.gen(function* () {
      return yield* appConfig.config
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env)))
  )

describe('configuration', () => {
  it('parses with no variables set, using the documented defaults', async () => {
    const config = await parse({})
    expect(config.server.port).toBe(3000)
    expect(config.database.driver).toBe('sqlite')
    expect(config.security.rateLimitMax).toBe(0)
    expect(config.observability.metricsEnabled).toBe(false)
    expect(config.logging.transport).toEqual(['console'])
    expect(config.logging.rotation).toBe('daily')
    expect(config.logging.fileMaxFiles).toBe(14)
  })

  it('parses LOG_TRANSPORT as a list, ignoring spaces and repeats', async () => {
    expect((await parse({ LOG_TRANSPORT: 'console, file' })).logging.transport).toEqual([
      'console',
      'file'
    ])
    expect((await parse({ LOG_TRANSPORT: 'file,file' })).logging.transport).toEqual(['file'])
  })

  it('accepts the four rotation periods and rejects anything else', async () => {
    for (const rotation of ['hourly', 'daily', 'weekly', 'monthly']) {
      expect((await parse({ LOG_ROTATION: rotation })).logging.rotation).toBe(rotation)
    }
    await expect(parse({ LOG_ROTATION: 'yearly' })).rejects.toThrow(/LOG_ROTATION/)
  })

  it('reads every duration as whole milliseconds', async () => {
    const config = await parse({
      REQUEST_TIMEOUT: '1500',
      SHUTDOWN_TIMEOUT: '2500',
      SHUTDOWN_DRAIN_DELAY: '300',
      LOG_FLUSH_INTERVAL: '50',
      RATE_LIMIT_WINDOW: '120000',
      OTEL_EXPORT_INTERVAL: '750'
    })
    expect(Duration.toMillis(config.server.requestTimeout)).toBe(1500)
    expect(Duration.toMillis(config.server.shutdownTimeout)).toBe(2500)
    expect(Duration.toMillis(config.server.shutdownDrainDelay)).toBe(300)
    expect(Duration.toMillis(config.logging.flushInterval)).toBe(50)
    expect(Duration.toMillis(config.security.rateLimitWindow)).toBe(120_000)
    expect(Duration.toMillis(config.observability.exportInterval)).toBe(750)
  })

  it('refuses a duration with a unit, naming the variable', async () => {
    await expect(parse({ REQUEST_TIMEOUT: '30 seconds' })).rejects.toThrow(
      /REQUEST_TIMEOUT must be a whole number of milliseconds/
    )
    await expect(parse({ RATE_LIMIT_WINDOW: '1 minute' })).rejects.toThrow(/RATE_LIMIT_WINDOW/)
    await expect(parse({ REQUEST_TIMEOUT: '1.5' })).rejects.toThrow(/REQUEST_TIMEOUT/)
  })

  it('refuses a duration below its minimum', async () => {
    await expect(parse({ REQUEST_TIMEOUT: '0' })).rejects.toThrow(/REQUEST_TIMEOUT.*at least 1/)
    await expect(parse({ RATE_LIMIT_WINDOW: '-5' })).rejects.toThrow(/RATE_LIMIT_WINDOW/)
    // zero is meaningful for a pause
    expect(
      Duration.toMillis((await parse({ SHUTDOWN_DRAIN_DELAY: '0' })).server.shutdownDrainDelay)
    ).toBe(0)
  })

  it('defaults the services of the Docker Compose stack, so development needs no setup', async () => {
    const config = await parse({})
    expect(config.observability.otlpEndpoint).toBe('http://localhost:4318')
    expect(Redacted.value(config.observability.otlpHeaders)).toBe(
      'authorization=edgy-dev-ingestion-key'
    )
    expect(Redacted.value(config.security.redisUrl)).toBe('redis://:securedb@localhost:6379')
    expect(telemetryEnabled(config.observability)).toBe(true)
  })

  it('turns telemetry off with OTEL_SDK_DISABLED, whatever the endpoint', async () => {
    const config = await parse({ OTEL_SDK_DISABLED: 'true' })
    expect(telemetryEnabled(config.observability)).toBe(false)
  })

  it('does not allow shipping logs while telemetry is off', async () => {
    await expect(
      parse({ LOG_TRANSPORT: 'console,otlp', OTEL_SDK_DISABLED: 'true' })
    ).rejects.toThrow(/otlp/)
    const ok = await parse({ LOG_TRANSPORT: 'console,otlp' })
    expect(ok.logging.transport).toEqual(['console', 'otlp'])
  })

  it('does not print a secret', async () => {
    const config = await parse({ OTEL_EXPORTER_OTLP_HEADERS: 'authorization=real-secret' })
    expect(JSON.stringify(config.observability.otlpHeaders)).not.toContain('real-secret')
    expect(Redacted.value(config.observability.otlpHeaders)).toBe('authorization=real-secret')
  })

  it('rejects an unknown or empty LOG_TRANSPORT', async () => {
    await expect(parse({ LOG_TRANSPORT: 'console,syslog' })).rejects.toThrow(/LOG_TRANSPORT/)
    await expect(parse({ LOG_TRANSPORT: ',' })).rejects.toThrow(/LOG_TRANSPORT/)
  })

  it('reads overrides from every section', async () => {
    const config = await parse({
      PORT: '4100',
      DATABASE_DRIVER: 'd1',
      LOG_FORMAT: 'json',
      RATE_LIMIT_MAX: '50',
      METRICS_ENABLED: 'true'
    })
    expect(config.server.port).toBe(4100)
    expect(config.database.driver).toBe('d1')
    expect(config.logging.format).toBe('json')
    expect(config.security.rateLimitMax).toBe(50)
    expect(config.observability.metricsEnabled).toBe(true)
  })

  it('fails on a present-but-invalid value', async () => {
    await expect(parse({ PORT: 'abc' })).rejects.toThrow(/PORT/)
    await expect(parse({ DATABASE_DRIVER: 'mysql' })).rejects.toThrow(/DATABASE_DRIVER/)
  })

  it('refuses credentialed CORS with a wildcard origin', async () => {
    await expect(parse({ CORS_CREDENTIALS: 'true' })).rejects.toThrow(/CORS_ORIGINS/)
    const ok = await parse({ CORS_CREDENTIALS: 'true', CORS_ORIGINS: 'https://app.example.com' })
    expect(ok.cors.origins).toEqual(['https://app.example.com'])
  })
})

describe('.env.example', () => {
  it('is exactly what config:generate would write', () => {
    const onDisk = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8')
    expect(onDisk).toBe(renderExample(appConfig.specs))
  })

  it('lists every variable once, and its default parses', async () => {
    const names = appConfig.specs.map((spec) => spec.name)
    expect(new Set(names).size).toBe(names.length)

    const defaults = Object.fromEntries(appConfig.specs.map((spec) => [spec.name, spec.default]))
    await expect(parse(defaults)).resolves.toBeDefined()
  })

  it('writes durations as plain milliseconds', () => {
    expect(renderExample(appConfig.specs)).toContain('REQUEST_TIMEOUT=30000')
  })
})
