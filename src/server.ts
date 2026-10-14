import { Effect } from 'effect'
import { H3, serve } from 'h3'
import { ConfigService } from './config.ts'
import { requestId } from './middleware/request_id.ts'
import { requestLogger } from './middleware/request_logger.ts'
import { routes } from './routes.ts'

/**
 * Fully wired application router.
 *
 * Global middleware runs in registration order, so the request id is assigned
 * before the logger reads it for its annotations.
 */
export const app: H3 = routes(new H3()).use(requestId()).use(requestLogger())

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
