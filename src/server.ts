import { Duration, Effect } from 'effect'
import { serve } from 'h3'
import { fileURLToPath } from 'node:url'
import { makeNodeApp } from './application.ts'
import { ConfigService } from './kernel/config/service.ts'
import { directoryAssets, embeddedAssets } from './kernel/http/node_assets.ts'
import { acceptProxyProtocol } from './kernel/http/proxy_protocol.ts'

/**
 * Starts the HTTP server and keeps the effect running until it is interrupted
 * (`SIGINT`/`SIGTERM` reach `NodeRuntime.runMain`, which interrupts the fiber).
 *
 * Shutdown order is owned by the scope, not by the server library: srvx's own
 * signal handler is disabled (`gracefulShutdown: false`), so the finalizers run
 * in reverse acquisition order — stop accepting and drain, release the
 * database, and only then flush the log buffer.
 *
 * Draining waits for in-flight *requests* (bounded by `SHUTDOWN_TIMEOUT`), then
 * closes whatever sockets remain. Waiting on `server.close()` itself would stall
 * for the whole timeout whenever a connection never completed a request.
 */
export const serveHttp = Effect.gen(function* () {
  const config = yield* ConfigService
  const { host, port, shutdownTimeout, shutdownDrainDelay, proxyProtocol } = config.server
  // The browser assets come from the single executable, or from the `public/` directory the build
  // leaves next to the entry.
  const { app, runtime } = yield* makeNodeApp({
    assets: embeddedAssets() ?? directoryAssets(fileURLToPath(new URL('./public', import.meta.url)))
  })

  const server = yield* Effect.acquireRelease(
    Effect.sync(() => {
      // `manual`: the PROXY protocol reader must be in place before the first connection.
      const instance = serve(app, {
        port,
        hostname: host,
        silent: true,
        gracefulShutdown: false,
        manual: true
      })
      const listener = instance.node?.server
      if (listener !== undefined) acceptProxyProtocol(listener, proxyProtocol)
      // A failed bind is reported by `ready()` below, which is why this one is not.
      void Promise.resolve(instance.serve()).catch(() => undefined)
      return instance
    }),
    (instance) =>
      Effect.gen(function* () {
        // Readiness flips first, so a load balancer stops routing here before the
        // listener closes; the optional pause gives it time to notice.
        runtime.beginDrain()
        if (Duration.toMillis(shutdownDrainDelay) > 0) {
          yield* Effect.logInfo(`Draining for ${Duration.format(shutdownDrainDelay)}`)
          yield* Effect.sleep(shutdownDrainDelay)
        }

        const pending = yield* runtime.inFlight.count
        yield* Effect.logInfo(
          pending === 0
            ? 'Shutting down'
            : `Shutting down, waiting for ${pending} request(s) in flight`
        )

        // Stops listening and closes idle connections; resolves only when
        // every connection has ended, so it is awaited last.
        const closed = instance.close()
        yield* runtime.inFlight.drained.pipe(
          Effect.timeoutOrElse({
            duration: shutdownTimeout,
            orElse: () =>
              Effect.gen(function* () {
                const remaining = yield* runtime.inFlight.count
                yield* Effect.logWarning(
                  `Shutdown timed out with ${remaining} request(s) still in flight; closing them`
                )
              })
          })
        )
        yield* Effect.promise(() => instance.close(true))
        // Closing the sockets aborts what was cut off, but the fibers behind those requests stop on
        // their own schedule. Give them a moment to settle, so none queries the closed database or
        // logs after the final flush.
        yield* runtime.inFlight.drained.pipe(Effect.timeoutOption('1 second'), Effect.asVoid)
        yield* Effect.promise(() => closed)
        yield* Effect.logInfo('Server stopped')
      })
  )

  // `silent` also hides srvx's own listen failure (for example EADDRINUSE), so
  // surface it here: a failed bind must stop the command, not leave it idle.
  yield* Effect.promise(() => server.ready())
  yield* Effect.logInfo(`Listening on http://${host}:${port}`)

  // Keep the fiber alive so the scope (and the server) stays open.
  return yield* Effect.never
}).pipe(Effect.scoped)
