import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { layer as configLayer } from '#/kernel/config/config.ts'
import { LoggerLayer } from '#/observer/logger.ts'
import { TelemetryRuntimeLayer } from '#/observer/tracing.ts'

const platformLayer = NodeServices.layer
const telemetryLayer = TelemetryRuntimeLayer
const loggerDependencies = Layer.mergeAll(platformLayer, telemetryLayer)

export const CoreLayer = Layer.mergeAll(
  platformLayer,
  telemetryLayer,
  LoggerLayer.pipe(Layer.provide(loggerDependencies))
).pipe(Layer.provideMerge(configLayer))
