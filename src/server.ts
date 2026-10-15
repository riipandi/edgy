import { Effect } from 'effect'
import { serve } from 'h3'
import { createApp } from './app.ts'
import { ConfigService } from './kernel/config.ts'
import { makeHttpRuntime } from './kernel/http/runtime.ts'

/**
 * Starts the HTTP server and keeps the effect running until it is interrupted
 * (for example by `SIGINT`). The server closes when the scope finalises, and
 * because the services are the command's own layers, the database connection
 * and the log buffer are released right after it, in reverse order.
 */
export const serveHttp = Effect.gen(function* () {
  const { host, port, cors } = yield* ConfigService
  const runtime = yield* makeHttpRuntime
  const app = createApp({ runtime, cors })

  yield* Effect.logInfo(`Starting server on http://${host}:${port}`)

  yield* Effect.acquireRelease(
    Effect.sync(() => serve(app, { port, hostname: host })),
    (server) => Effect.promise(() => server.close())
  )

  // Keep the fiber alive so the scope (and the server) stays open.
  return yield* Effect.never
}).pipe(Effect.scoped)
