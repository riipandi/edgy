import * as NodeServices from '@effect/platform-node/NodeServices'
import { Layer } from 'effect'
import { ErrorReporterLayer } from '../observer/error_reporter.ts'
import { LoggerLayer } from '../observer/logger.ts'
import { TelemetryRuntimeLayer } from '../observer/telemetry.ts'
import { ConfigLayer } from './config/service.ts'

const platform = NodeServices.layer

/**
 * Process-wide services, provided once at the entry point: configuration, the non-blocking logger
 * (console, file and/or OTLP, per `LOG_TRANSPORT`), trace and metric export, the error reporter,
 * and the Node platform services the CLI needs.
 *
 * `provideMerge` builds `ConfigLayer` once and keeps `ConfigService` in the output, since the
 * logger reads configuration. `platform` and `TelemetryRuntimeLayer` are shared: the logger's file
 * sink needs `FileSystem`, and its OTLP sink needs the tracer's `Flusher`. Telemetry sits outside
 * the logger, so on shutdown it flushes last: final spans and log lines export after the server
 * stops.
 */
export const CoreLayer = Layer.mergeAll(
  platform,
  TelemetryRuntimeLayer,
  ErrorReporterLayer,
  LoggerLayer.pipe(Layer.provide(Layer.mergeAll(platform, TelemetryRuntimeLayer)))
).pipe(Layer.provideMerge(ConfigLayer))
