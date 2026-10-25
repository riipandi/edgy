import { NodeRuntime } from '@effect/platform-node'
import { Effect } from 'effect'
import { CliError } from 'effect/cli'
import { run, subcommandOf } from '#/command/root.ts'
import { CoreLayer } from '#/kernel/layers.ts'

const args = process.argv.slice(2)

// Telemetry exists for the long-running server. A one-shot command would
// only wait, at exit, for a collector it has nothing worth sending to,
// so it runs with export off unless told otherwise.
if (subcommandOf(args) !== 'serve') {
  process.env['OTEL_SDK_DISABLED'] ??= 'true'
  NodeRuntime.runMain(run(args).pipe(Effect.provide(CoreLayer)))
} else {
  // The serve command owns the shutdown sequence: it completes its scope on
  // SIGINT/SIGTERM with every finalizer awaited. runMain's interrupt-based
  // exit detaches async finalizers, so the server runs without it.
  void Effect.runPromise(run(args).pipe(Effect.provide(CoreLayer))).then(
    () => process.exit(0),
    (cause) => {
      // A CliError was already rendered by the command's own handler;
      // printing it again would duplicate the report.
      if (!CliError.isCliError(cause))
        console.error(cause instanceof Error ? (cause.stack ?? cause.message) : cause)
      process.exit(1)
    }
  )
}
