import { NodeHttpServer } from '@effect/platform-node'
import { Effect } from 'effect'
import { createServer } from 'node:http'

// Resolves with the signal name when a shutdown signal arrives. The scope then
// closes normally, which awaits every finalizer; interruption would detach
// them instead. A second signal falls back to Node's force-exit.
export const awaitShutdownSignal: Effect.Effect<string> = Effect.callback<string>((resume) => {
  const handler = (signal: NodeJS.Signals): void => resume(Effect.succeed(signal))
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
  return Effect.sync(() => {
    process.off('SIGINT', handler)
    process.off('SIGTERM', handler)
  })
})

// `server.close` waits for every open socket, including idle keep-alive ones
// (a browser tab holds one open), which would stall the shutdown for the
// keep-alive timeout; dropping idle sockets first makes the drain bound only
// by in-flight requests.
export const gracefulServerLayer = (options: { readonly host: string; readonly port: number }) =>
  NodeHttpServer.layer(() => {
    const server = createServer()
    const close = server.close.bind(server)
    server.close = ((callback) => {
      server.closeIdleConnections()
      return close(callback)
    }) as typeof server.close
    return server
  }, options)
