import { Effect, Fiber } from 'effect'
import * as HttpServer from 'effect/http/HttpServer'
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
