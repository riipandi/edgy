import { Config, ConfigProvider, Context, Effect, Layer, Redacted } from 'effect'
import { appUrlConfig } from './app.ts'
import { cacheConfig } from './cache.ts'
import { databaseConfig } from './database.ts'
import { docsConfig } from './docs.ts'
import { group, type ValueOf } from './field.ts'
import { loggingConfig } from './logging.ts'
import { DEV_HEADERS, observabilityConfig, telemetryEnabled } from './observability.ts'
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
      // The dev ingestion key is inert while telemetry is off; the gate fires
      // only when a production boot would actually export with it.
      if (
        config.app.nodeEnv === 'production' &&
        telemetryEnabled(config.observability) &&
        Redacted.value(config.observability.headers) === DEV_HEADERS
      ) {
        return yield* Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({
              message:
                'OTEL_EXPORTER_OTLP_HEADERS: the development ingestion key is active in production; set an explicit value'
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

export type { LogFormat } from './logging.ts'
