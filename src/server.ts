import { Effect } from 'effect'
import { H3, serve } from 'h3'
import { ConfigService } from './config.ts'
import { routes } from './routes.ts'

/** Fully wired application router. */
export const app: H3 = routes(new H3())

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
  yield* Effect.never
}).pipe(Effect.scoped)
