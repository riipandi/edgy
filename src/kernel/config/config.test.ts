import { ConfigProvider, Duration, Effect, Logger } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { AppConfig, appConfig, ConfigLayer } from './config.ts'
import { databaseConfig, securityConfig } from './definitions.ts'
import { telemetryEnabled } from './helpers.ts'

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
    expect(config.security).toMatchObject({ rateLimitEnabled: false, corsEnabled: true })
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

describe('the dev OTLP headers are gated to development', () => {
  it('accepts an explicit header value in production', async () => {
    const config = await resolved({
      APP_MODE: 'production',
      OTEL_EXPORTER_OTLP_HEADERS: 'authorization=prod-key'
    })
    expect(config.app.appMode).toBe('production')
  })

  it('leaves a telemetry-off production boot alone', async () => {
    const config = await resolved({ APP_MODE: 'production', OTEL_SDK_DISABLED: 'true' })
    expect(telemetryEnabled(config.observability)).toBe(false)
  })
})

describe('DATABASE_URL warnings', () => {
  const warningsFor = (url: string, token: string): Promise<ReadonlyArray<string>> => {
    const lines: Array<string> = []
    const logger = Logger.layer([
      Logger.make(({ logLevel, message }) => {
        if (logLevel === 'Warn') lines.push(String(message))
      })
    ])
    return Effect.runPromise(
      databaseConfig.config.pipe(
        Effect.asVoid,
        Effect.provide(logger),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnvRecord({ DATABASE_URL: url, DATABASE_TOKEN: token })
          )
        )
      )
    ).then(() => lines)
  }

  it('warns when the token would travel over plain http', async () => {
    const warnings = await warningsFor('http://probe.turso.io', 'a-token')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('DATABASE_TOKEN travels unencrypted')
  })

  it('stays silent for every encrypted remote scheme', async () => {
    for (const scheme of ['libsql://', 'turso://', 'https://'])
      expect(await warningsFor(`${scheme}probe.turso.io`, 'a-token')).toEqual([])
  })

  it('warns that a token is ignored next to a local database', async () => {
    const warnings = await warningsFor('file:/tmp/ignored-token.db', 'a-token')
    expect(warnings).toEqual(['DATABASE_TOKEN is ignored: DATABASE_URL points at a local database'])
  })
})

describe('securityConfig', () => {
  it('parses TRUST_PROXY through the composed config', async () => {
    const parsed = await Effect.runPromise(
      securityConfig.config.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnvRecord({ TRUST_PROXY: '10.0.0.1' }))
        )
      )
    )
    expect(parsed.trustProxy.trustAll).toBe(false)
    expect(parsed.trustProxy.proxies.check('10.0.0.1', 'ipv4')).toBe(true)
  })
})
