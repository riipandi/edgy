import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { cacheConfig } from './cache.ts'
import { corsConfig } from './cors.ts'
import { databaseConfig } from './database.ts'
import { group, type ValueOf } from './field.ts'
import { loggingConfig } from './logging.ts'
import { observabilityConfig, telemetryEnabled } from './observability.ts'
import { securityConfig } from './security.ts'
import { serverConfig } from './server.ts'

export type { LogFormat } from './logging.ts'
export type { ObservabilityConfig } from './observability.ts'
export { telemetryEnabled } from './observability.ts'

/**
 * The whole configuration, one section per file. Each section owns its variables, defaults,
 * descriptions and validation. Missing variables fall back to development defaults; invalid
 * present values (a non-numeric `PORT`) fail with a `ConfigError` while the layer builds.
 */
export const appConfig = group(
  {
    server: serverConfig,
    database: databaseConfig,
    logging: loggingConfig,
    security: securityConfig,
    cache: cacheConfig,
    observability: observabilityConfig,
    cors: corsConfig
  },
  {
    // A rule that spans sections cannot live in either one.
    transform: (raw) =>
      raw.logging.transport.includes('otlp') && !telemetryEnabled(raw.observability)
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message:
                  'LOG_TRANSPORT includes otlp, which needs telemetry on (OTEL_SDK_DISABLED must not be true)'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

/** Parsed, validated application configuration. */
export type AppConfig = ValueOf<typeof appConfig>

/** Depend on this key instead of reading `process.env`, so configuration stays injectable. */
export class ConfigService extends Context.Service<ConfigService, AppConfig>()('ConfigService') {}

/** Loads configuration once per runtime from the ambient `ConfigProvider`. */
export const ConfigLayer: Layer.Layer<ConfigService, Config.ConfigError> = Layer.effect(
  ConfigService,
  appConfig.config
)
