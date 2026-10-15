import { Cause, Effect, Exit, Option, type Tracer } from 'effect'
import { Headers, HttpTraceContext } from 'effect/http'
import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import { isProbe } from '../../observer/quiet_paths.ts'
import { traceTypeId } from '../../observer/trace_id.ts'
import { CacheBypass, type CacheTally, CacheTrace, summarizeTally } from '../cache/read_through.ts'
import { type AppError, RequestTimeout } from '../errors.ts'
import { errorEnvelope, linkHeader, successEnvelope } from './envelope.ts'
import type { ApiError, ApiErrorBody, ApiSuccess, Reply } from './envelope.ts'
import { defectBody, errorBody, statusBody } from './error_body.ts'
import { type HttpEnv, runtimeOf } from './runtime.ts'

export interface RunOptions {
  /** Status for a successful response. Defaults to h3's `200`. */
  readonly successStatus?: number
}

/** Response header that carries the `trc_` trace id, beside `x-request-id`. */
export const TRACE_ID_HEADER = 'x-trace-id'

/** Response header that says how a cached read was answered: `HIT`, `MISS` or `BYPASS`. */
export const CACHE_HEADER = 'x-cache'

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** The caller's trace, when the request carries a W3C `traceparent` header. */
const callerSpan = (event: H3Event): Option.Option<Tracer.ExternalSpan> => {
  const traceparent = event.req.headers.get('traceparent')
  return traceparent === null
    ? Option.none()
    : HttpTraceContext.w3c(Headers.fromInput({ traceparent }))
}

/**
 * What a program settled on. A client error (below 500) is a value, not a failure: the server span
 * ends `Ok` with `http.response.status_code` set, as OpenTelemetry asks for server spans, so 404s
 * and validation errors stay out of error dashboards. Only 5xx and defects fail the span.
 */
export type Outcome<A> =
  | { readonly kind: 'value'; readonly value: A }
  | { readonly kind: 'refused'; readonly error: AppError }

/**
 * Runs a program on the shared runtime and reports what it settled on, for whichever response
 * shape the caller renders (the API envelope in `runEffect`, or an HTML page). A typed failure
 * carries its own `status` and `clientMessage`, so a new error needs no branch here.
 *
 * Owns everything around the program: request timeout, interruption on client disconnect, error
 * reporting, tracing, and the envelope.
 *
 * **Tracing.** The program runs in a server span named after the matched route
 * (`GET /api/users/:id`, never the raw path, so span names stay low-cardinality), with the method,
 * path, route, request id and final status as attributes. A `traceparent` header continues the
 * caller's trace and its sampled flag is honoured; otherwise the request is a trace root, recorded
 * for `OTEL_TRACES_SAMPLE_RATIO` of requests. A recorded trace's id is returned as
 * `metadata.trace_id`.
 *
 * **Errors.** The program is wrapped in `Effect.withErrorReporting`: database failures, timeouts
 * and defects reach the error reporters once, while expected failures (validation, not found) and
 * interruptions do not. A 500 always carries only a generic client message.
 */
export const runProgram = async <A, E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<A, E, HttpEnv>,
  status: number
): Promise<Exit.Exit<Outcome<A>, E | RequestTimeout>> => {
  const requestId = requestIdOf(event)
  const { requestTimeout, runPromiseExit, tracing } = runtimeOf(event)

  // Drop the trailing slash of a mounted group's index route, so both forms share one span name.
  const matched = event.context.matchedRoute?.route
  const route = matched !== undefined && matched.length > 1 ? matched.replace(/\/+$/, '') : matched
  const caller = callerSpan(event)
  // Probes polled on a timer are not traced: they would fill the backend with identical spans.
  // A caller's `traceparent` still gets its trace; failures still reach the log and reporters.
  const sampling = Option.isSome(caller)
    ? { parent: caller.value }
    : isProbe(event.url.pathname)
      ? { sampled: false }
      : tracing.sampleRatio < 1
        ? { sampled: Math.random() < tracing.sampleRatio }
        : {}

  const spanOptions: Tracer.SpanOptions = {
    kind: 'server',
    captureStackTrace: false,
    attributes: {
      'http.request.method': event.req.method,
      'url.path': event.url.pathname,
      'http.route': route,
      'request.id': requestId
    },
    ...sampling
  }

  /**
   * Records the request's trace on the event, on success and failure alike. The request log,
   * written after the fiber ends, joins it through the event. A recorded trace is also offered
   * to the client as `metadata.trace_id` (a `trc_` TypeID). A failed request needs it most.
   */
  const noteTrace = Effect.currentSpan.pipe(
    Effect.flatMap((span) =>
      Effect.sync(() => {
        event.context.trace = { traceId: span.traceId, spanId: span.spanId, sampled: span.sampled }
        if (!tracing.enabled || !span.sampled) return
        // The backend indexes the hex id; the `trc_` form is what clients see. Setting it on the
        // span too makes a pasted `trc_` id searchable.
        const id = traceTypeId(span.traceId)
        event.context.traceTypeId = id
        // Both header sets: h3 builds an error response from `errHeaders` only.
        event.res.headers.set(TRACE_ID_HEADER, id)
        event.res.errHeaders.set(TRACE_ID_HEADER, id)
        span.attribute('trace.typeid', id)
      })
    ),
    Effect.ignore
  )

  // `?nocache=true` on a read: every read-through under this request goes to its source.
  const bypassCache = event.req.method === 'GET' && event.url.searchParams.get('nocache') === 'true'

  const cacheTally: CacheTally = { hit: 0, miss: 0, bypass: 0 }

  const program = effect.pipe(
    Effect.provideService(CacheBypass, bypassCache),
    Effect.provideService(CacheTrace, cacheTally),
    Effect.timeoutOrElse({
      duration: requestTimeout,
      orElse: () => Effect.fail(new RequestTimeout({ after: requestTimeout }))
    }),
    Effect.map((value): Outcome<A> => ({ kind: 'value', value })),
    Effect.catchIf(
      (error: AppError) => error.status < 500,
      (error): Effect.Effect<Outcome<A>> => Effect.succeed({ kind: 'refused', error })
    ),
    Effect.tap((outcome) =>
      Effect.annotateCurrentSpan(
        'http.response.status_code',
        outcome.kind === 'value' ? status : outcome.error.status
      )
    ),
    Effect.tapError((error) =>
      Effect.annotateCurrentSpan('http.response.status_code', error.status)
    ),
    Effect.ensuring(noteTrace),
    Effect.withErrorReporting,
    Effect.annotateLogs(requestId === undefined ? {} : { requestId }),
    Effect.withSpan(`${event.req.method} ${route ?? event.url.pathname}`, spanOptions)
  )

  const exit = await runPromiseExit(program, { signal: event.req.signal })
  const cache = summarizeTally(cacheTally)
  if (cache !== undefined) {
    event.context.cache = cache
    // Both header sets: h3 builds error responses from `errHeaders` only.
    event.res.headers.set(CACHE_HEADER, cache.toUpperCase())
    event.res.errHeaders.set(CACHE_HEADER, cache.toUpperCase())
  }
  return exit
}

/** Sets the status and builds the error envelope of a client or server refusal. */
const refusal = (event: H3Event, error: AppError): ApiError => {
  event.res.status = error.status
  return errorEnvelope(
    event,
    error.status,
    error.clientMessage,
    errorBody(error, runtimeOf(event).diagnostics)
  )
}

/**
 * The error envelope for a program that failed: a client that hung up, a typed failure, or a
 * defect (answered with a generic message; the cause is already with the error reporters).
 */
const failure = (event: H3Event, cause: Cause.Cause<AppError>): ApiError => {
  const { diagnostics } = runtimeOf(event)
  const fail = (code: number, message: string, error: ApiErrorBody): ApiError => {
    event.res.status = code
    return errorEnvelope(event, code, message, error)
  }

  if (Cause.hasInterruptsOnly(cause)) {
    return fail(
      CLIENT_CLOSED_REQUEST,
      'Request cancelled',
      statusBody(CLIENT_CLOSED_REQUEST, { diagnostics })
    )
  }

  const typed: Option.Option<AppError> = Cause.findErrorOption(cause)
  if (Option.isSome(typed)) return refusal(event, typed.value)

  return fail(500, 'Internal server error', defectBody(cause, diagnostics))
}

/** Runs a program and shapes its outcome into the API envelope. `runProgram` does the work. */
export const runEffect = <E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<Reply, E, HttpEnv>,
  options: RunOptions = {}
): Promise<ApiSuccess | ApiError> => {
  const status = options.successStatus ?? 200

  return runProgram(event, effect, status).then((exit) => {
    if (!Exit.isSuccess(exit)) return failure(event, exit.cause)

    const outcome = exit.value
    if (outcome.kind === 'refused') return refusal(event, outcome.error)

    event.res.status = status
    const body = successEnvelope(event, status, outcome.value)
    const link = body.links === undefined ? undefined : linkHeader(body.links)
    if (link !== undefined) event.res.headers.set('link', link)
    return body
  })
}
