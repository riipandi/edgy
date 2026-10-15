import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { LoggerLayer } from '../observer/logger.ts'
import { ConfigLayer } from './config/service.ts'

/**
 * Process-wide services, provided once at the entry point (`main.ts`):
 * configuration, the non-blocking logger (console and/or file, per
 * `LOG_TRANSPORT`) and the Node platform services (`FileSystem`, `Path`,
 * `Terminal`, …) the CLI needs.
 *
 * The logger reads configuration, so `provideMerge` builds `ConfigLayer` once
 * and keeps `ConfigService` in the output for everything downstream.
 */
export const CoreLayer = Layer.mergeAll(
  NodeServices.layer,
  // The file sink needs `FileSystem`; the platform layer is built once and shared.
  LoggerLayer.pipe(Layer.provide(NodeServices.layer))
).pipe(Layer.provideMerge(ConfigLayer))
