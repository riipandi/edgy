import { Duration, Layer, Redacted } from 'effect'
import { BlockList } from 'node:net'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'

export const config: AppConfigShape = {
  server: { host: '127.0.0.1', port: 0 },
  database: { driver: 'sqlite', path: ':memory:', autoMigrate: false },
  logging: {
    level: 'Info',
    transport: ['console'],
    file: 'storage/logs/app.jsonl',
    rotation: 'daily',
    fileMaxFiles: 14,
    format: 'pretty',
    flushInterval: Duration.millis(250)
  },
  security: {
    rateLimitEnabled: true,
    rateLimitMax: 1000,
    rateLimitWindow: Duration.millis(60_000),
    rateLimitStore: 'database',
    rateLimitRedisUrl: Redacted.make('redis://localhost:6379'),
    trustProxy: { trustAll: false, proxies: new BlockList() }
  },
  cache: {
    enabled: true,
    storage: 'memory',
    redisUrl: Redacted.make('redis://localhost:6379'),
    ttl: Duration.millis(30_000),
    maxEntries: 256
  },
  observability: {
    metricsEnabled: false,
    sdkDisabled: true,
    endpoint: 'http://localhost:4318',
    headers: Redacted.make('authorization=dev-key'),
    serviceName: 'edgy',
    exportInterval: Duration.millis(5_000),
    compression: 'gzip'
  },
  docs: { enabled: false }
}

export const testConfig = Layer.succeed(AppConfig, config)

export const limitedConfig = Layer.succeed(AppConfig, {
  ...config,
  security: { ...config.security, rateLimitMax: 2 }
})

export const docsConfig = Layer.succeed(AppConfig, { ...config, docs: { enabled: true } })
