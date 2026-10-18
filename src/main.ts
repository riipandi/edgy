import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { cli } from './command/cli.ts'
import { cliLayer } from './layers.ts'

NodeRuntime.runMain(cli.pipe(Effect.provide(Layer.mergeAll(cliLayer, NodeServices.layer))))
