import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { DatabaseLayer } from '#/database/adapter.ts'
import { LoggerLayer } from '#/observer/logger.ts'
import { RuntimeMetricsLayer } from '#/observer/runtime-metrics.ts'
import { TelemetryRuntimeLayer } from '#/observer/tracing.ts'
import { ConfigLayer } from './config/config.ts'
import { applicationServices } from './registry.ts'

const platformLayer = NodeServices.layer
const telemetryLayer = Layer.merge(TelemetryRuntimeLayer, RuntimeMetricsLayer)
const loggerDependencies = Layer.mergeAll(platformLayer, telemetryLayer)

export const CoreLayer = Layer.mergeAll(
  platformLayer,
  telemetryLayer,
  LoggerLayer.pipe(Layer.provide(loggerDependencies))
).pipe(Layer.provideMerge(ConfigLayer))

export const ApplicationLayer = applicationServices.pipe(Layer.provideMerge(DatabaseLayer))
