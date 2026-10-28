import { Effect, Fiber } from 'effect'
import * as HttpServer from 'effect/http/HttpServer'
import { get } from 'node:http'
import { expect, it } from 'vite-plus/test'
import { awaitShutdownSignal, gracefulServerLayer } from './graceful.ts'

it('resolves with the name of the shutdown signal', async () => {
  const signal = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkScoped(awaitShutdownSignal)
      // A real suspension so the signal handler is installed and the fiber is
      // parked before the signal arrives.
      yield* Effect.sleep('10 millis')
      process.kill(process.pid, 'SIGINT')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.scoped)
  )
  expect(signal).toBe('SIGINT')
})

it('builds a closable server through the graceful layer', async () => {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const http = yield* HttpServer.HttpServer
      expect(http).toBeDefined()
    }).pipe(Effect.provide(gracefulServerLayer({ host: '127.0.0.1', port: 0 })), Effect.scoped)
  )
  expect(exit._tag).toBe('Success')
})

it(
  'destroys in-flight connections once the drain deadline passes',
  { timeout: 10_000 },
  async () => {
    let closeBeganAt = 0
    let resolveClosed: (at: number) => void = () => {}
    const socketClosed = new Promise<number>((resolve) => {
      resolveClosed = resolve
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpServer.HttpServer
        if (http.address._tag === 'UnixPathAddress')
          throw new Error('unexpected unix socket address')
        const port = http.address.port
        // A request the server never answers: its socket is not idle, so only
        // the drain deadline can close it.
        const hung = get({ host: '127.0.0.1', port, path: '/' })
        hung.on('close', () => resolveClosed(Date.now()))
        hung.on('error', () => resolveClosed(Date.now()))
        yield* Effect.sleep('100 millis')
        closeBeganAt = Date.now()
        // The scope ends here; the finalizer drains, then destroys what is left.
      }).pipe(
        Effect.provide(
          gracefulServerLayer({ host: '127.0.0.1', port: 0, drainTimeout: '200 millis' })
        ),
        Effect.scoped
      )
    )

    const closedAt = await Promise.race([
      socketClosed,
      new Promise<number>((resolve) => setTimeout(() => resolve(Number.NaN), 3000))
    ])
    expect(Number.isNaN(closedAt)).toBe(false)
    const drainedAfter = closedAt - closeBeganAt
    // Not destroyed instantly by closeIdleConnections, and not left hanging
    // past the deadline either.
    expect(drainedAfter).toBeGreaterThanOrEqual(150)
    expect(drainedAfter).toBeLessThan(3000)
  }
)
