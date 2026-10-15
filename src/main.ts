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
// Telemetry exists for the long-running server. A one-shot command would only wait, at exit, for a
// collector it has nothing worth sending to, so it runs with export off unless told otherwise.
if (process.argv[2] !== 'serve') process.env['OTEL_SDK_DISABLED'] ??= 'true'

// oxlint-disable-next-line effecttsgo/strict-effect-provide
run.pipe(Effect.provide(CoreLayer), NodeRuntime.runMain)
