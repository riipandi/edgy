import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { applicationConfig, databaseConfig, serverConfig, loggingConfig } from './definitions.ts'
import { mailerConfig, observabilityConfig, redisConfig } from './definitions.ts'
import { securityConfig, cacheConfig } from './definitions.ts'
import { group, type ValueOf } from './field.ts'
import { telemetryEnabled } from './helpers.ts'

export const appConfig = group({
  app: applicationConfig,
  server: serverConfig,
  database: databaseConfig,
  logging: loggingConfig,
  security: securityConfig,
  cache: cacheConfig,
  redis: redisConfig,
  mailer: mailerConfig,
  observability: observabilityConfig
})

const validatedConfig = appConfig.config.pipe(
  Config.mapEffect((config) =>
    Effect.gen(function* () {
      if (config.logging.transport.includes('otlp') && !telemetryEnabled(config.observability)) {
        return yield* Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({
              message: 'OTLP logging requires telemetry to be enabled'
            })
          )
        )
      }
      return config
    })
  )
)

export type AppConfigShape = ValueOf<typeof appConfig>

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()('AppConfig') {}

export const ConfigLayer: Layer.Layer<AppConfig, Config.ConfigError> = Layer.effect(
  AppConfig,
  validatedConfig
)

export type { LogFormat } from './definitions.ts'
