import { Layer } from 'effect'
import { layer as configLayer } from '#/kernel/config/app-config.ts'
import { layer as loggerLayer } from '#/observer/logger.ts'
import { layer as tracingLayer } from '#/observer/tracing.ts'

export const cliLayer = Layer.mergeAll(
  configLayer,
  loggerLayer.pipe(Layer.provide(configLayer)),
  tracingLayer.pipe(Layer.provide(configLayer))
)
