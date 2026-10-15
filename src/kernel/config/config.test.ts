import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import { readFileSync } from 'node:fs'
import { renderExample } from './example.ts'
import { appConfig } from './service.ts'

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

  it('quotes values that contain spaces', () => {
    expect(renderExample(appConfig.specs)).toContain('REQUEST_TIMEOUT="30 seconds"')
  })
})
