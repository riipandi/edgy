import { NodeRuntime } from '@effect/platform-node'
import { Effect } from 'effect'
import { run } from '#/command/cli.ts'
import { CoreLayer } from '#/kernel/layers.ts'

// Telemetry exists for the long-running server. A one-shot command would
// only wait, at exit, for a collector it has nothing worth sending to,
// so it runs with export off unless told otherwise.
const isServe = process.argv[2] === 'serve'
if (!isServe) {
  process.env['OTEL_SDK_DISABLED'] ??= 'true'
  NodeRuntime.runMain(run.pipe(Effect.provide(CoreLayer)))
} else {
  // The serve command owns the shutdown sequence: it completes its scope on
  // SIGINT/SIGTERM with every finalizer awaited. runMain's interrupt-based
  // exit detaches async finalizers, so the server runs without it.
  void Effect.runPromise(run.pipe(Effect.provide(CoreLayer))).then(
    () => process.exit(0),
    (cause) => {
      console.error(cause instanceof Error ? (cause.stack ?? cause.message) : cause)
      process.exit(1)
    }
  )
}
