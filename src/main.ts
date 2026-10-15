import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { run } from './command/cli.ts'
import { ObservabilityLayer } from './runtime.ts'

/**
 * CLI entry point.
 *
 * `ObservabilityLayer` supplies the configured logger and minimum log level
 * (`LOG_LEVEL`) to every subcommand, so `migrate`, `seed` and `serve` all
 * respect the same verbosity setting.
 */
// Single composition point for process-wide services; commands add their own via `Command.provide`.
// oxlint-disable-next-line effecttsgo/strict-effect-provide
run.pipe(Effect.provide(Layer.merge(NodeServices.layer, ObservabilityLayer)), NodeRuntime.runMain)
