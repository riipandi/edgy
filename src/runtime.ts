import { Layer, Logger, ManagedRuntime } from 'effect'
import { ConfigLayer } from './config.ts'
import { DatabaseLayer as DatabaseConnectionLayer } from './database/runtime.ts'
import { UserCacheLayer } from './service/user_service.ts'

/**
 * Cross-cutting observability services: pretty console logging with
 * annotations and log spans enabled.
 */
export const ObservabilityLayer = Logger.layer([Logger.consolePretty()])

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
