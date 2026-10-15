import { Effect } from 'effect'
import { serve } from 'h3'
import { app } from './app.ts'
import { ConfigService } from './config.ts'

/**
 * Starts the HTTP server and keeps the effect running until it is interrupted
 * (for example by `SIGINT`). The server is closed when the scope finalises.
 */
export const serveHttp: Effect.Effect<void, never, ConfigService> = Effect.gen(function* () {
  const { host, port } = yield* ConfigService

  yield* Effect.logInfo(`Starting server on http://${host}:${port}`)

  yield* Effect.acquireRelease(
    Effect.sync(() => serve(app, { port, hostname: host })),
    (server) => Effect.promise(() => server.close())
  )

  // Keep the fiber alive so the scope (and the server) stays open.
  return yield* Effect.never
}).pipe(Effect.scoped)
