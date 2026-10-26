import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { appUrlConfig } from './app.ts'
import { cacheConfig } from './cache.ts'
import { databaseConfig } from './database.ts'
import { docsConfig } from './docs.ts'
import { group, type ValueOf } from './field.ts'
import { loggingConfig } from './logging.ts'
import { observabilityConfig, telemetryEnabled } from './observability.ts'
import { redisConfig } from './redis.ts'
import { securityConfig } from './security.ts'
import { serverConfig } from './server.ts'

export const appConfig = group({
  app: appUrlConfig,
  server: serverConfig,
  database: databaseConfig,
  logging: loggingConfig,
  security: securityConfig,
  cache: cacheConfig,
  redis: redisConfig,
  observability: observabilityConfig,
  docs: docsConfig
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

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()('AppConfig') {}

export const ConfigLayer: Layer.Layer<AppConfig, Config.ConfigError> = Layer.effect(
  AppConfig,
  validatedConfig
)

export type { LogFormat } from './logging.ts'
