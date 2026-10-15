import { type Duration, Effect, type Exit } from 'effect'
import { definePlugin, type H3Event, onRequest } from 'h3'
import type { DatabaseService } from '../../database/service.ts'
import type { UserService } from '../../service/user_service.ts'
import { ConfigService } from '../config.ts'

/** Services an HTTP handler program may require. */
export type HttpEnv = UserService | DatabaseService

/**
 * Bridge from h3 (promise/callback world) back into the Effect runtime.
 *
 * It is a snapshot of the service context captured by the `serve` command, so
 * handlers run with exactly the layers the process was started with — one
 * database connection, one logger — and there is no second runtime to build or
 * dispose. Closing the scope that built the layers also closes the server.
 */
export interface HttpRuntime {
  /**
   * Runs a handler program. Passing the request's `AbortSignal` interrupts the
   * fiber when the client disconnects, so abandoned requests stop working.
   */
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, HttpEnv>,
    options?: Effect.RunOptions
  ) => Promise<Exit.Exit<A, E>>
  readonly runSync: (effect: Effect.Effect<void>) => void
  /** Upper bound for one handler program (`REQUEST_TIMEOUT`). */
  readonly requestTimeout: Duration.Duration
}

/** Captures the current context into an {@link HttpRuntime}. */
export const makeHttpRuntime: Effect.Effect<HttpRuntime, never, HttpEnv | ConfigService> =
  Effect.gen(function* () {
    const { requestTimeout } = yield* ConfigService
    const services = yield* Effect.context<HttpEnv>()
    return {
      runPromiseExit: Effect.runPromiseExitWith(services),
      runSync: Effect.runSyncWith(services),
      requestTimeout
    }
  })

declare module 'h3' {
  interface H3EventContext {
    /** Set by {@link provideRuntime}; read through {@link runtimeOf}. */
    runtime?: HttpRuntime
    /** Set by the `requestId` plugin. */
    requestId?: string
    /** `performance.now()` at request start, set by the `httpObserver` plugin. */
    startedAt?: number
  }
}

/** Plugin that exposes the runtime to every handler and middleware. Register it first. */
export const provideRuntime = definePlugin<HttpRuntime>((app, runtime) => {
  app.use(
    onRequest((event) => {
      event.context.runtime = runtime
    })
  )
})

/** Returns the runtime attached to an event. Throws if `provideRuntime` was not registered. */
export const runtimeOf = (event: H3Event): HttpRuntime => {
  const runtime = event.context.runtime
  if (runtime === undefined)
    throw new Error('HttpRuntime is not provided; register provideRuntime first')
  return runtime
}
