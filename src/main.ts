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
run.pipe(Effect.provide(Layer.merge(NodeServices.layer, ObservabilityLayer)), NodeRuntime.runMain)
