import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { corsConfig } from './cors.ts'
import { databaseConfig } from './database.ts'
import { group, type ValueOf } from './field.ts'
import { loggingConfig } from './logging.ts'
import { observabilityConfig } from './observability.ts'
import { securityConfig } from './security.ts'
import { serverConfig } from './server.ts'

export type { CorsConfig } from './cors.ts'
export type { DatabaseConfig } from './database.ts'
export type { FieldSpec } from './field.ts'
export type { LogFormat, LoggingConfig } from './logging.ts'
export type { ObservabilityConfig } from './observability.ts'
export type { SecurityConfig } from './security.ts'
export type { ServerConfig } from './server.ts'

/**
 * The whole configuration, one section per concern. A section is a file in this
 * directory that owns its variables, defaults, descriptions and validation;
 * adding a concern means adding a file and one line here, so this file stays the
 * table of contents and never grows with the number of keys.
 *
 * The same declarations feed `config:generate`, so the example dotenv file is
 * derived from the parsers and cannot drift from them.
 *
 * Missing variables fall back to development defaults; present-but-invalid
 * values (for example a non-numeric `PORT`) fail with a typed `ConfigError`
 * while the layer is being built.
 */
export const appConfig = group(
  {
    server: serverConfig,
    database: databaseConfig,
    logging: loggingConfig,
    security: securityConfig,
    observability: observabilityConfig,
    cors: corsConfig
  },
  {
    // A rule that spans sections cannot live in either one.
    transform: (raw) =>
      raw.logging.transport.includes('otlp') && raw.observability.otlpEndpoint === ''
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message: 'LOG_TRANSPORT includes otlp, which requires OTEL_EXPORTER_OTLP_ENDPOINT'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

/** Parsed, validated application configuration. */
export type AppConfig = ValueOf<typeof appConfig>

/**
 * Configuration service. Consumers depend on this key instead of reading
 * `process.env` directly, which keeps configuration injectable and testable.
 * Read the section you need (`const { port } = (yield* ConfigService).server`).
 */
export class ConfigService extends Context.Service<ConfigService, AppConfig>()('ConfigService') {}

/**
 * Loads configuration from the ambient `ConfigProvider` (environment variables
 * by default) exactly once per runtime.
 */
export const ConfigLayer: Layer.Layer<ConfigService, Config.ConfigError> = Layer.effect(
  ConfigService,
  appConfig.config
)
