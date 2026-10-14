import { Config, ConfigProvider, Context, Effect, Layer, LogLevel } from 'effect'

/** Parsed CORS policy, consumed by the CORS middleware. */
export interface CorsConfig {
  /** Allowed origins: `*` for any, otherwise an explicit allowlist. */
  readonly origins: '*' | readonly string[]
  /** Allowed methods for preflight requests. */
  readonly methods: '*' | readonly string[]
  /** Allowed request headers for preflight requests. */
  readonly allowHeaders: '*' | readonly string[]
  /** Whether to send `access-control-allow-credentials`. */
  readonly credentials: boolean
  /** `access-control-max-age` value, or `false` to omit the header. */
  readonly maxAge: string | false
}

/**
 * Shape of the parsed, validated application configuration.
 */
export interface AppConfig {
  readonly databasePath: string
  readonly host: string
  readonly port: number
  /** Minimum severity emitted by the Effect logger. */
  readonly logLevel: LogLevel.LogLevel
  /** Cross-origin policy applied to every route. */
  readonly cors: CorsConfig
}

/**
 * Parses a comma-separated env value into an allowlist.
 *
 * `*` (or an empty value) means "any", which is what h3's `CorsOptions.origin`
 * expects for a wildcard.
 */
const parseList = (value: string): '*' | readonly string[] => {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '*') return '*'
  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** Parses `CORS_MAX_AGE`; `false` (or `0`) omits the preflight cache header. */
const parseMaxAge = (value: string): string | false => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === '' || trimmed === 'false' || trimmed === '0') return false
  return trimmed
}

const corsSchema = Config.all({
  origins: Config.String('CORS_ORIGINS').pipe(Config.withDefault('*')),
  methods: Config.String('CORS_METHODS').pipe(Config.withDefault('*')),
  allowHeaders: Config.String('CORS_ALLOW_HEADERS').pipe(Config.withDefault('*')),
  credentials: Config.Boolean('CORS_CREDENTIALS').pipe(Config.withDefault(false)),
  maxAge: Config.String('CORS_MAX_AGE').pipe(Config.withDefault('86400'))
}).pipe(
  Config.mapEffect((raw) => {
    const origins = parseList(raw.origins)

    // h3 rejects `credentials: true` with a wildcard origin because
    // `Access-Control-Allow-Origin: *` is invalid for credentialed requests.
    // Fail while the layer is built so the mistake surfaces at startup.
    if (raw.credentials && origins === '*') {
      return Effect.fail(
        new Config.ConfigError(
          new ConfigProvider.SourceError({
            message:
              'CORS_CREDENTIALS=true requires an explicit CORS_ORIGINS allowlist (wildcard "*" is invalid with credentials)'
          })
        )
      )
    }

    return Effect.succeed({
      origins,
      methods: parseList(raw.methods),
      allowHeaders: parseList(raw.allowHeaders),
      credentials: raw.credentials,
      maxAge: parseMaxAge(raw.maxAge)
    } satisfies CorsConfig)
  })
)

/**
 * Declarative configuration schema. Missing variables fall back to development
 * defaults; present-but-invalid values (for example a non-numeric `PORT`) fail
 * with a typed `ConfigError` while the layer is being built.
 *
 * `LOG_LEVEL` accepts Effect's level names (`All`, `Fatal`, `Error`, `Warn`,
 * `Info`, `Debug`, `Trace`, `None`) and is case-sensitive.
 */
const schema = Config.all({
  databasePath: Config.String('DATABASE_PATH').pipe(Config.withDefault('./storage/data/edgy.db')),
  host: Config.String('HOST').pipe(Config.withDefault('0.0.0.0')),
  port: Config.Port('PORT').pipe(Config.withDefault(3000)),
  logLevel: Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info')),
  cors: corsSchema
})

/**
 * Configuration service. Consumers depend on this key instead of reading
 * `process.env` directly, which keeps configuration injectable and testable.
 */
export class ConfigService extends Context.Service<ConfigService, AppConfig>()('ConfigService') {}

/**
 * Loads configuration from the ambient `ConfigProvider` (environment variables
 * by default) exactly once per runtime.
 */
export const ConfigLayer: Layer.Layer<ConfigService, Config.ConfigError> = Layer.effect(
  ConfigService,
  schema
)
