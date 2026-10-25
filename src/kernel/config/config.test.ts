import { ConfigProvider, Duration, Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { AppConfig, appConfig, ConfigLayer } from './config.ts'
import { telemetryEnabled } from './observability.ts'

const resolved = (env: Record<string, string> = {}) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* AppConfig
    }).pipe(
      Effect.provide(ConfigLayer),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)))
    )
  )

describe('appConfig', () => {
  it('resolves every section from documented defaults', async () => {
    const config = await resolved()
    expect(config.app.baseUrl).toBe('http://localhost:3000')
    expect(config.server).toMatchObject({ host: '0.0.0.0', port: 3000 })
    expect(config.database.target).toMatchObject({ kind: 'local', path: './storage/data/app.db' })
    expect(config.logging).toMatchObject({
      level: 'Info',
      transport: ['console', 'file'],
      format: 'pretty'
    })
    expect(config.security).toMatchObject({ rateLimitEnabled: true, corsEnabled: true })
    expect(config.cache).toMatchObject({ enabled: true, maxEntries: 256 })
    expect(Duration.toMillis(config.cache.ttl)).toBe(30_000)
    expect(config.redis.enabled).toBe(false)
    expect(config.observability).toMatchObject({ serviceName: 'edgy', compression: 'gzip' })
    expect(config.docs.enabled).toBe(false)
    expect(telemetryEnabled(config.observability)).toBe(true)
  })

  it('derives the database target from DATABASE_URL', async () => {
    const config = await resolved({ DATABASE_URL: 'file:/tmp/app.db' })
    expect(config.database.target).toMatchObject({ kind: 'local', path: '/tmp/app.db' })
  })

  it('tags every field spec with a section', () => {
    expect(appConfig.specs.length).toBeGreaterThan(0)
    for (const spec of appConfig.specs) {
      expect(spec.name).toMatch(/^[A-Z][A-Z0-9_]+$/)
      expect(spec.description.length).toBeGreaterThan(0)
      expect(spec.section).toBeTruthy()
    }
  })
})

describe('the OTLP transport requires telemetry', () => {
  it('accepts otlp transport while telemetry is enabled', async () => {
    const config = await resolved({ LOG_TRANSPORT: 'console,otlp' })
    expect(config.logging.transport).toEqual(['console', 'otlp'])
  })

  it('rejects otlp transport with the SDK disabled', async () => {
    await expect(resolved({ LOG_TRANSPORT: 'otlp', OTEL_SDK_DISABLED: 'true' })).rejects.toThrow(
      /OTLP logging requires telemetry to be enabled/
    )
    await expect(
      resolved({ LOG_TRANSPORT: 'console,otlp', OTEL_SDK_DISABLED: 'true' })
    ).rejects.toThrow(/OTLP logging requires telemetry to be enabled/)
  })
})
