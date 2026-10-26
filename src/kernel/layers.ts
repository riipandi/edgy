import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { makeDatabaseLayer } from '#/database/adapter.ts'
import { LoggerLayer } from '#/observer/logger.ts'
import { RuntimeMetricsLayer } from '#/observer/runtime-metrics.ts'
import { TelemetryRuntimeLayer } from '#/observer/tracing.ts'
import { ConfigLayer } from './config/config.ts'
import { moduleServiceLayer } from './registry.ts'

const platformLayer = NodeServices.layer
const telemetryLayer = Layer.merge(TelemetryRuntimeLayer, RuntimeMetricsLayer)
const loggerDependencies = Layer.mergeAll(platformLayer, telemetryLayer)

export const CoreLayer = Layer.mergeAll(
  platformLayer,
  telemetryLayer,
  LoggerLayer.pipe(Layer.provide(loggerDependencies))
).pipe(Layer.provideMerge(ConfigLayer))

// Serve is the only surface that narrates the connection lifecycle; the shared
// DatabaseLayer used by the one-shot commands stays silent.
export const ApplicationLayer = moduleServiceLayer.pipe(
  Layer.provideMerge(makeDatabaseLayer({ lifecycleLogs: true }))
)
