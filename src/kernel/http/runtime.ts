import { type Duration, Effect, type Exit } from 'effect'
import { definePlugin, type H3Event, HTTPError } from 'h3'
import { ConfigService } from '../config/service.ts'
import { type InFlight, makeInFlight } from './inflight.ts'

/**
 * Registry of the services an HTTP handler program may require. It starts empty
 * and each service declares itself next to its own definition by declaration
 * merging, so the kernel never names a domain service:
 *
 * ```ts
 * declare module '../kernel/http/runtime.ts' {
 *   interface HttpServices {
 *     user: UserService
 *   }
 * }
 * ```
 */
export interface HttpServices {}

/** Union of every registered service: the environment of a handler program. */
export type HttpEnv = HttpServices[keyof HttpServices]

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
  /** Requests being handled right now; shutdown drains it. */
  readonly inFlight: InFlight
  /** Whether shutdown has begun; readiness reports unavailable from then on. */
  readonly isDraining: () => boolean
  /** Marks shutdown as begun. Irreversible for the life of the runtime. */
  readonly beginDrain: () => void
}

/** Captures the current context into an {@link HttpRuntime}. */
export const makeHttpRuntime: Effect.Effect<HttpRuntime, never, HttpEnv | ConfigService> =
  Effect.gen(function* () {
    const { requestTimeout } = (yield* ConfigService).server
    const services = yield* Effect.context<HttpEnv>()
    let draining = false
    return {
      runPromiseExit: Effect.runPromiseExitWith(services),
      runSync: Effect.runSyncWith(services),
      requestTimeout,
      inFlight: makeInFlight(),
      isDraining: () => draining,
      beginDrain: () => {
        draining = true
      }
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

/**
 * Plugin that exposes the runtime to every handler and middleware and counts
 * the request as in flight until the rest of the chain has finished. Register
 * it first, so the count covers every other middleware.
 */
export const provideRuntime = definePlugin<HttpRuntime>((app, runtime) => {
  app.use(async (event, next) => {
    event.context.runtime = runtime
    runtime.inFlight.enter()
    try {
      return await next()
    } finally {
      runtime.inFlight.leave()
    }
  })
})

/** Returns the runtime attached to an event. Throws if `provideRuntime` was not registered. */
export const runtimeOf = (event: H3Event): HttpRuntime => {
  const runtime = event.context.runtime
  if (runtime === undefined)
    throw new Error('HttpRuntime is not provided; register provideRuntime first')
  return runtime
}

/**
 * Wraps a readiness handler so it answers `503` once shutdown has begun. A load
 * balancer that polls it stops routing here before the server closes, instead of
 * discovering the shutdown through refused connections.
 */
export const unlessDraining =
  <R>(handler: (event: H3Event) => R) =>
  (event: H3Event): R => {
    if (runtimeOf(event).isDraining()) {
      throw new HTTPError({ status: 503, message: 'Shutting down' })
    }
    return handler(event)
  }
