import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import { Effect, Runtime } from 'effect'
import { run } from './command/cli.ts'
import { closeDevServer } from './kernel/http/dev_server.ts'
import { CoreLayer } from './kernel/layers.ts'

/**
 * CLI entry point and the only place that calls `Effect.provide` with a layer.
 *
 * `CoreLayer` gives every subcommand the validated configuration, the
 * non-blocking logger and the platform services; commands add their own data
 * layers through `Command.provide`. `runMain` interrupts on `SIGINT`/`SIGTERM`,
 * which closes every scope — server, database, then the log buffer, flushed last.
 */
run.pipe(
  // oxlint-disable-next-line effecttsgo/strict-effect-provide
  Effect.provide(CoreLayer),
  NodeRuntime.runMain({
    // Under `pnpm dev` the Vite server outlives the program unless it is stopped, and the process
    // would never end. Everything else has already been released by now (the scopes are closed).
    teardown: (exit, onExit) =>
      Runtime.defaultTeardown(exit, (code) => void closeDevServer().finally(() => onExit(code)))
  })
)
