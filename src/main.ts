import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'
import { run } from './command/cli.ts'

run.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
