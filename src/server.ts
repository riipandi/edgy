import { Effect } from 'effect'
import { serve } from 'h3'
import { createApp } from './app.ts'
import { ConfigService } from './kernel/config.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'

/**
 * Starts the HTTP server and keeps the effect running until it is interrupted
 * (`SIGINT`/`SIGTERM` reach `NodeRuntime.runMain`, which interrupts the fiber).
 *
 * Shutdown order is owned by the scope, not by the server library: srvx's own
 * signal handler is disabled (`gracefulShutdown: false`), so the finalizers run
 * in reverse acquisition order — stop accepting and drain in-flight requests
 * (bounded by `SHUTDOWN_TIMEOUT`, then force-close), release the database, and
 * only then flush the log buffer.
 */
export const serveHttp = Effect.gen(function* () {
  const { host, port, cors, bodyLimit, shutdownTimeout } = yield* ConfigService
  const runtime = yield* makeHttpRuntime
  const app = createApp({ runtime, cors, bodyLimit })

  yield* Effect.logInfo(`Starting server on http://${host}:${port}`)

  yield* Effect.acquireRelease(
    Effect.sync(() => serve(app, { port, hostname: host, silent: true, gracefulShutdown: false })),
    (server) =>
      Effect.promise(() => server.close()).pipe(
        Effect.timeoutOrElse({
          duration: shutdownTimeout,
          orElse: () =>
            Effect.logWarning('Shutdown timed out; closing active connections').pipe(
              Effect.andThen(Effect.promise(() => server.close(true)))
            )
        })
      )
  )

  // Keep the fiber alive so the scope (and the server) stays open.
  return yield* Effect.never
}).pipe(Effect.scoped)
