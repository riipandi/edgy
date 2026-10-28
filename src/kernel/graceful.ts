import { NodeHttpServer } from '@effect/platform-node'
import { Duration, Effect } from 'effect'
import { createServer } from 'node:http'
import { constants } from 'node:os'

// Resolves with the signal name when a shutdown signal arrives. The scope then
// closes normally, which awaits every finalizer; interruption would detach
// them instead. The handler stays installed past the first signal so a second
// one can exit immediately: the drain has already been given its chance.
export const awaitShutdownSignal: Effect.Effect<string> = Effect.callback<string>((resume) => {
  let received = false
  const handler = (signal: NodeJS.Signals): void => {
    if (received) return process.exit(128 + (constants.signals[signal] ?? 0))
    received = true
    resume(Effect.succeed(signal))
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
  return Effect.sync(() => {
    if (received) return
    process.off('SIGINT', handler)
    process.off('SIGTERM', handler)
  })
})

// `server.close` waits for every open socket, including idle keep-alive ones
// (a browser tab holds one open), which would stall the shutdown for the
// keep-alive timeout; dropping idle sockets first makes the drain bound only
// by in-flight requests, and the deadline destroys whatever is still running
// when the window ends.
export const gracefulServerLayer = (options: {
  readonly host: string
  readonly port: number
  readonly drainTimeout?: Duration.Input
}) =>
  NodeHttpServer.layer(() => {
    const server = createServer()
    const drainMillis =
      options.drainTimeout !== undefined
        ? Duration.toMillis(Duration.fromInputUnsafe(options.drainTimeout))
        : 10_000
    const close = server.close.bind(server)
    server.close = ((callback) => {
      server.closeIdleConnections()
      const deadline = setTimeout(() => server.closeAllConnections(), drainMillis)
      return close((error) => {
        clearTimeout(deadline)
        callback?.(error)
      })
    }) as typeof server.close
    return server
  }, options)
