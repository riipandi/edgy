import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import { Effect } from 'effect'
import { run } from './command/cli.ts'
import { CoreLayer } from './kernel/layers.ts'

/**
 * CLI entry point, and the only place that calls `Effect.provide` with a layer. `CoreLayer` gives
 * every subcommand the configuration, the logger and the platform services. Commands add their data
 * layers through `Command.provide`. `runMain` interrupts on SIGINT/SIGTERM, which closes every scope:
 * server, then database, then the log buffer, flushed last.
 */
// oxlint-disable-next-line effecttsgo/strict-effect-provide
run.pipe(Effect.provide(CoreLayer), NodeRuntime.runMain)
