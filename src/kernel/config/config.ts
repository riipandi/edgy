import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { cacheConfig } from './cache.ts'
import { databaseConfig } from './database.ts'
import { group, type ValueOf } from './field.ts'
import { loggingConfig } from './logging.ts'
import { observabilityConfig, telemetryEnabled } from './observability.ts'
import { securityConfig } from './security.ts'
import { serverConfig } from './server.ts'

export type { LogFormat } from './logging.ts'
export type { ObservabilityConfig } from './observability.ts'
export { telemetryEnabled } from './observability.ts'

export const appConfig = group({
  server: serverConfig,
  database: databaseConfig,
  logging: loggingConfig,
  security: securityConfig,
  cache: cacheConfig,
  observability: observabilityConfig
})

const validatedConfig = appConfig.config.pipe(
  Config.mapEffect((config) =>
    config.logging.transport.includes('otlp') && !telemetryEnabled(config.observability)
      ? Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({
              message: 'OTLP logging requires telemetry to be enabled'
            })
          )
        )
      : Effect.succeed(config)
  )
)

export type AppConfigShape = ValueOf<typeof appConfig>

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()('app/Config') {}

export const layer: Layer.Layer<AppConfig, Config.ConfigError> = Layer.effect(
  AppConfig,
  validatedConfig
)
