import { Duration, Layer, Redacted } from 'effect'
import { BlockList } from 'node:net'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { testDatabasePath, testDatabaseUrl } from './database-url.ts'

const databasePath = testDatabasePath('config.db')

export const config: AppConfigShape = {
  app: { nodeEnv: 'test', baseUrl: 'http://localhost:3000' },
  server: { host: '127.0.0.1', port: 0 },
  database: {
    url: testDatabaseUrl('config.db'),
    token: Redacted.make(''),
    autoMigrate: false,
    target: { kind: 'local', path: databasePath }
  },
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
    trustProxy: { trustAll: false, proxies: new BlockList() },
    corsEnabled: true,
    corsAllowedOrigins: []
  },
  cache: {
    enabled: true,
    ttl: Duration.millis(30_000),
    maxEntries: 256
  },
  redis: {
    enabled: false,
    url: 'redis://default:securedb@localhost:6379'
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
