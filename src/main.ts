import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { run } from '#/command/cli.ts'
import { cliLayer } from './layers.ts'

// Telemetry exists for the long-running server. A one-shot command would
// only wait, at exit, for a collector it has nothing worth sending to,
// so it runs with export off unless told otherwise.
if (process.argv[2] !== 'serve') process.env['OTEL_SDK_DISABLED'] ??= 'true'

NodeRuntime.runMain(run.pipe(Effect.provide(Layer.mergeAll(cliLayer, NodeServices.layer))))
