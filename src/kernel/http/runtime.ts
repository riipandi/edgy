import { type Context, type Duration, Effect, type Exit, LogLevel } from 'effect'
import { definePlugin, type H3Event, HTTPError } from 'h3'
import { ConfigService, telemetryEnabled } from '../config/service.ts'
import { type InFlight, makeInFlight } from './inflight.ts'

/**
 * Services an HTTP handler program may require. It starts empty; each service adds itself by
 * declaration merging, so the kernel never names a domain service:
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
 * Bridge from h3's promise world back into Effect. It snapshots the service context the process
 * started with, so handlers share its layers (one database connection, one logger) and no second
 * runtime exists. Closing the scope that built the layers also closes the server.
 */
export interface HttpRuntime {
  /** The captured service context, for a consumer that provides it itself (the rpc bridge). */
  readonly services: Context.Context<HttpEnv>
  /** Runs a handler program. The request's `AbortSignal` interrupts it on client disconnect. */
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, HttpEnv>,
    options?: Effect.RunOptions
  ) => Promise<Exit.Exit<A, E>>
  readonly runSync: (effect: Effect.Effect<void>) => void
  /** Upper bound for one handler program (`REQUEST_TIMEOUT`). */
  readonly requestTimeout: Duration.Duration
  /** Requests being handled right now; shutdown drains it. */
  readonly inFlight: InFlight
  /** Requests handled at once before new ones are refused with 503; `0` disables the guard. */
  readonly maxInFlight: number
  /** Whether traces are exported, and the share of requests whose trace is recorded. */
  readonly tracing: { readonly enabled: boolean; readonly sampleRatio: number }
  /** Whether error responses carry `error.debug`: on when the logger is at `Debug` or below. */
  readonly diagnostics: boolean
  /** Whether shutdown has begun; readiness reports unavailable from then on. */
  readonly isDraining: () => boolean
  /** Marks shutdown as begun. Irreversible for the life of the runtime. */
  readonly beginDrain: () => void
}

/** Captures the current context as an `HttpRuntime`. */
export const makeHttpRuntime: Effect.Effect<HttpRuntime, never, HttpEnv | ConfigService> =
  Effect.gen(function* () {
    const { server, observability } = yield* ConfigService
    const { requestTimeout, maxInFlight } = server
    const services = yield* Effect.context<HttpEnv>()
    const diagnostics = yield* LogLevel.isEnabled('Debug')
    let draining = false
    return {
      services,
      runPromiseExit: Effect.runPromiseExitWith(services),
      runSync: Effect.runSyncWith(services),
      requestTimeout,
      inFlight: makeInFlight(),
      maxInFlight,
      diagnostics,
      tracing: {
        enabled: telemetryEnabled(observability),
        sampleRatio: observability.sampleRatio
      },
      isDraining: () => draining,
      beginDrain: () => {
        draining = true
      }
    }
  })

declare module 'h3' {
  interface H3EventContext {
    /** Set by `provideRuntime`; read through `runtimeOf`. */
    runtime?: HttpRuntime
    /** Set by the `requestId` plugin. */
    requestId?: string
    /** `performance.now()` at request start, set by the `httpObserver` plugin. */
    startedAt?: number
    /** The span the request ran in, so later log lines can join its trace. */
    trace?: { readonly traceId: string; readonly spanId: string; readonly sampled: boolean }
    /** The `trc_` form of the trace id, set when the trace was recorded and exported. */
    traceTypeId?: string
    /** How the request's cached reads were answered, for the request log. */
    cache?: 'hit' | 'miss' | 'bypass'
    /** Set in development; read when building an HTML response's policy. */
    development?: boolean
    /** Country and city of the client, from the platform's headers. */
    location?: { readonly country?: string; readonly city?: string }
    /** `error.code` of the response, for the request log. */
    errorCode?: string
  }
}

/**
 * The same bytes, with `done` called once when the body ends, fails or is cancelled by the client.
 * Pull-based, so the consumer's pace is still what drives the source.
 */
const untilClosed = (
  body: ReadableStream<Uint8Array>,
  done: () => void
): ReadableStream<Uint8Array> => {
  const reader = body.getReader()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    done()
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          controller.close()
          finish()
        } else {
          controller.enqueue(chunk.value)
        }
      } catch (error) {
        controller.error(error)
        finish()
      }
    },
    async cancel(reason) {
      finish()
      await reader.cancel(reason)
    }
  })
}

/**
 * Exposes the runtime to every handler and counts the request in flight until its answer has been
 * sent: for a streamed body that is when the stream ends, so a shutdown does not cut a page that
 * is still flowing while reporting a clean drain. Register it first.
 */
export const provideRuntime = definePlugin<HttpRuntime>((app, runtime) => {
  app.use(async (event, next) => {
    event.context.runtime = runtime
    runtime.inFlight.enter()
    let held = false
    try {
      const result = await next()
      if (result instanceof Response && result.body !== null && !result.bodyUsed) {
        held = true
        return new Response(
          untilClosed(result.body, () => runtime.inFlight.leave()),
          result
        )
      }
      return result
    } finally {
      if (!held) runtime.inFlight.leave()
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
 * Answers `503` once shutdown has begun, so a polling load balancer stops routing before close.
 */
export const unlessDraining =
  <R>(handler: (event: H3Event) => R) =>
  (event: H3Event): R => {
    if (runtimeOf(event).isDraining()) {
      throw new HTTPError({ status: 503, message: 'Shutting down' })
    }
    return handler(event)
  }
