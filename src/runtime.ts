import { Config, Effect, Layer, Logger, ManagedRuntime, References } from 'effect'
import { ConfigLayer, ConfigService } from './config.ts'
import { DatabaseLayer as DatabaseConnectionLayer } from './database/runtime.ts'
import { UserCacheLayer } from './service/user_service.ts'

/**
 * Cross-cutting observability services.
 *
 * The pretty console logger and the minimum log level are both derived from
 * configuration, so `LOG_LEVEL` controls how verbose the process is. Reading
 * `ConfigService` here (rather than at each call site) means the level is
 * applied once, for the whole runtime — including logs emitted by middleware.
 */
export const ObservabilityLayer: Layer.Layer<never, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const { logLevel } = yield* ConfigService
    return Layer.merge(
      Logger.layer([Logger.consolePretty()]),
      Layer.succeed(References.MinimumLogLevel, logLevel)
    )
  })
).pipe(Layer.provide(ConfigLayer))

/** Database layer, with configuration supplied from the environment. */
export const DatabaseLayer = DatabaseConnectionLayer.pipe(Layer.provide(ConfigLayer))

/** Read-through user cache, backed by the database layer. */
export const CacheLayer = UserCacheLayer.pipe(Layer.provide(DatabaseLayer))

/**
 * Composition root. Ordering matters: configuration is built first, then the
 * database, then the cache, then observability is merged on top.
 */
export const MainLayer = Layer.mergeAll(ConfigLayer, DatabaseLayer, CacheLayer, ObservabilityLayer)

/** One runtime for the whole process, reused by every handler. */
export const AppRuntime = ManagedRuntime.make(MainLayer)

/** Service environment required by handler programs. */
export type AppEnv = Layer.Success<typeof MainLayer>
