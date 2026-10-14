import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { ConfigLayer } from '../config.ts'
import { AppRuntime } from '../runtime.ts'
import { serveHttp } from '../server.ts'

/** `serve` — start the HTTP server. */
export const serveCmd = Command.make('serve', {}, () =>
  serveHttp.pipe(
    Effect.provide(ConfigLayer),
    Effect.ensuring(Effect.promise(() => AppRuntime.dispose()))
  )
).pipe(Command.withDescription('Start the HTTP server'))
