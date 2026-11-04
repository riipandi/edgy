import { Config, Effect, Redacted } from 'effect'
import { choice, choiceList, custom, flag, group } from './field.ts'
import { int, logLevel, milliseconds, port, secret, text } from './field.ts'
import type { Node, ValueOf } from './field.ts'
import { DEV_HEADERS } from './helpers.ts'
import { isCleartext, parseBaseUrl, parseOriginList } from './validators.ts'
import { parseRedisUrl, parseTrustProxy, resolveDatabaseTarget } from './validators.ts'
import type { DatabaseTarget } from './validators.ts'

export const applicationConfig = group(
  {
    appMode: choice(
      'APP_MODE',
      ['development', 'test', 'production'],
      'development',
      'Runtime mode; production gates dev-only defaults'
    ),
    baseUrl: custom(
      {
        name: 'APP_BASE_URL',
        description: 'Public origin of the application, used to resolve relative request URLs',
        kind: 'string',
        default: 'http://localhost:3000'
      },
      Config.String('APP_BASE_URL').pipe(
        Config.withDefault('http://localhost:3000'),
        Config.mapEffect(parseBaseUrl)
      )
    ),
    docsEnabled: flag(
      'APP_OPENAPI_ENABLED',
      false,
      'Expose the OpenAPI document and the Scalar API reference for the API'
    )
  },
  'App'
)

export type ApplicationConfig = ValueOf<typeof applicationConfig>

export const serverConfig = group(
  {
    host: text('SERVER_HOST', '0.0.0.0', 'Interface the HTTP server binds to'),
    port: port('SERVER_PORT', 3000, 'Port the HTTP server listens on')
  },
  'Server'
)

const databaseFields = group(
  {
    url: text(
      'DATABASE_URL',
      'file:./storage/data/app.db',
      'Turso database URL: a file: URI for a local database, or a remote URL'
    ),
    token: secret('DATABASE_TOKEN', '', 'Turso auth token, required for a remote database')
  },
  'Database'
)

export const databaseConfig: Node<
  ValueOf<typeof databaseFields> & { readonly target: DatabaseTarget }
> = {
  config: databaseFields.config.pipe(
    Config.mapEffect((value) =>
      resolveDatabaseTarget(value.url, value.token).pipe(
        Effect.tap((target) =>
          target.kind === 'local' && Redacted.value(value.token).trim() !== ''
            ? Effect.logWarning(
                'DATABASE_TOKEN is ignored: DATABASE_URL points at a local database'
              )
            : Effect.void
        ),
        Effect.tap((target) =>
          isCleartext(target)
            ? Effect.logWarning(
                'DATABASE_URL uses http://, so DATABASE_TOKEN travels unencrypted; use https:// or libsql:// outside a loopback host'
              )
            : Effect.void
        ),
        Effect.map((target) => ({ ...value, target }))
      )
    )
  ),
  specs: databaseFields.specs
}

export type DatabaseConfig = ValueOf<typeof databaseConfig>

export const loggingConfig = group(
  {
    level: logLevel('LOG_LEVEL', 'Info', 'Minimum log severity'),
    transport: choiceList(
      'LOG_TRANSPORT',
      ['console', 'file', 'otlp'],
      ['console', 'file'],
      'Log sinks'
    ),
    file: text('LOG_FILE', 'storage/logs/app.jsonl', 'Base path for JSON-lines logs'),
    rotation: choice(
      'LOG_ROTATION',
      ['hourly', 'daily', 'weekly', 'monthly'],
      'daily',
      'Log rotation period'
    ),
    fileMaxFiles: int('LOG_FILE_MAX_FILES', 14, 'Maximum rotated log files; zero keeps all'),
    format: choice('LOG_FORMAT', ['pretty', 'json'], 'pretty', 'Console log format'),
    flushInterval: milliseconds('LOG_FLUSH_INTERVAL', 250, 'Buffered log flush interval', 1)
  },
  'Logging'
)

export type LogFormat = ValueOf<typeof loggingConfig>['format']

export const securityConfig = group(
  {
    rateLimitEnabled: flag('RATE_LIMIT_ENABLED', false, 'Enable API rate limiting'),
    rateLimitMax: int('RATE_LIMIT_MAX', 100, 'Requests allowed per client per window', 1),
    rateLimitWindow: milliseconds(
      'RATE_LIMIT_WINDOW',
      60_000,
      'Rate-limit window in milliseconds',
      1
    ),
    trustProxy: custom(
      {
        name: 'TRUST_PROXY',
        description:
          'Proxies that may set X-Forwarded-For: true, false, or comma-separated IPs/CIDRs',
        kind: 'string',
        default: 'false'
      },
      Config.String('TRUST_PROXY').pipe(
        Config.withDefault('false'),
        Config.mapEffect(parseTrustProxy)
      )
    ),
    corsEnabled: flag('CORS_ENABLED', true, 'Enable CORS for the API'),
    corsAllowedOrigins: custom(
      {
        name: 'CORS_ALLOWED_ORIGINS',
        description:
          'Origins allowed to call the API cross-origin, comma-separated (empty allows any origin)',
        kind: 'string',
        default: ''
      },
      Config.String('CORS_ALLOWED_ORIGINS').pipe(
        Config.withDefault(''),
        Config.mapEffect(parseOriginList)
      )
    )
  },
  'Security'
)

export const cacheConfig = group(
  {
    enabled: flag('CACHE_ENABLED', true, 'In-memory cache for feature lookups'),
    ttl: milliseconds('CACHE_TTL', 30_000, 'Cache entry lifetime in milliseconds', 1),
    maxEntries: int('CACHE_MAX_ENTRIES', 256, 'Maximum in-memory entries per cache', 1)
  },
  'Cache'
)

const DEV_REDIS_URL = 'redis://default:securedb@localhost:6379'

export const redisConfig = group(
  {
    enabled: flag(
      'REDIS_ENABLE',
      false,
      'Use Redis for the configured rate-limit and cache stores'
    ),
    url: custom(
      {
        name: 'REDIS_URL',
        description: 'Redis connection URL; each feature uses its own database index',
        kind: 'secret',
        default: DEV_REDIS_URL
      },
      Config.Redacted('REDIS_URL').pipe(
        Config.withDefault(Redacted.make(DEV_REDIS_URL)),
        Config.mapEffect((value) => parseRedisUrl(Redacted.value(value)))
      )
    )
  },
  'Redis'
)

export type RedisConfig = ValueOf<typeof redisConfig>

export const mailerConfig = group(
  {
    fromEmail: text('MAILER_FROM_EMAIL', 'mailer@example.com', 'Default sender email address'),
    fromName: text('MAILER_FROM_NAME', 'Edgy Mailer', 'Default sender display name'),
    smtpHost: text('MAILER_SMTP_HOST', 'localhost', 'SMTP server host'),
    smtpPort: port('MAILER_SMTP_PORT', 1025, 'SMTP server port'),
    smtpUsername: text('MAILER_SMTP_USERNAME', 'maileruser1', 'SMTP authentication username'),
    smtpPassword: secret('MAILER_SMTP_PASSWORD', 'mailerpass1', 'SMTP authentication password'),
    smtpSecure: flag('MAILER_SMTP_SECURE', false, 'Use TLS for the SMTP connection')
  },
  'Mailer'
)

export type MailerConfig = ValueOf<typeof mailerConfig>

export const observabilityConfig = group(
  {
    metricsEnabled: flag('OTEL_METRICS_ENABLED', false, 'Expose Prometheus metrics at /metrics'),
    sdkDisabled: flag('OTEL_SDK_DISABLED', false, 'Disable trace and metric export'),
    endpoint: text(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318',
      'OTLP/HTTP collector URL'
    ),
    headers: secret('OTEL_EXPORTER_OTLP_HEADERS', DEV_HEADERS, 'OTLP request headers'),
    serviceName: text('OTEL_SERVICE_NAME', 'edgy', 'Service name attached to telemetry'),
    exportInterval: milliseconds('OTEL_EXPORT_INTERVAL', 5_000, 'Telemetry export interval', 1),
    compression: choice(
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      ['gzip', 'none'],
      'gzip',
      'OTLP compression'
    )
  },
  'Observability'
)
