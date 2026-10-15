import { Cause, Effect, Exit, Option, type Tracer } from 'effect'
import { Headers, HttpTraceContext } from 'effect/http'
import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import { isProbe } from '../../observer/quiet_paths.ts'
import { traceTypeId } from '../../observer/trace_id.ts'
import { CacheBypass } from '../cache/read_through.ts'
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
 * Bridge Effect -> HTTP: run the program on the shared runtime and render the
 * outcome as the API envelope (`.llms/api-response.md`). A typed failure renders
 * itself (`status`, `clientMessage`, `detail` on {@link AppError}), so a new
 * error needs no branch here.
 *
 * The program already yields an encoded {@link Reply}; this function owns
 * everything around it: the request timeout, interruption on client
 * disconnect, error reporting, tracing, and the success or error envelope.
 *
 * **Tracing.** The program runs inside a server span named after the matched route
 * (`GET /api/users/:id`, never the raw path, so span names stay low-cardinality) with
 * the method, path, route, request id and final status as attributes. A `traceparent`
 * header continues the caller's trace and its sampled flag is honoured; otherwise the
 * request is a trace root, recorded for `OTEL_TRACES_SAMPLE_RATIO` of requests. When
 * traces are exported and this one is recorded, its id is returned as
 * `metadata.trace_id`, which is what lets a client report a problem that can be found.
 *
 * **Errors.** The program is wrapped in `Effect.withErrorReporting`, so a database
 * failure, a timeout or a defect reaches the error reporters (`error_reporter.ts`)
 * once, while expected failures (validation, not found: `ErrorReporter.ignore`) and
 * interruptions do not. The client only ever sees a generic message for a 500.
 */
export const runEffect = <E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<Reply, E, HttpEnv>,
  options: RunOptions = {}
): Promise<ApiSuccess | ApiError> => {
  const requestId = requestIdOf(event)
  const { requestTimeout, runPromiseExit, tracing } = runtimeOf(event)

  // The pattern the router matched, without the trailing slash a mounted group leaves on
  // its index route, so `/api/users/` and `/api/users` are one span name.
  const matched = event.context.matchedRoute?.route
  const route = matched !== undefined && matched.length > 1 ? matched.replace(/\/+$/, '') : matched
  const caller = callerSpan(event)
  // A probe polled on a timer (`/health`) is not worth a recorded trace: it would fill the
  // backend with identical spans. A caller that sends its own sampled `traceparent` still
  // gets its trace; failures are not lost, they reach the log and the error reporters.
  const sampling = Option.isSome(caller)
    ? { parent: caller.value }
    : isProbe(event.url.pathname)
      ? { sampled: false }
      : tracing.sampleRatio < 1
        ? { sampled: Math.random() < tracing.sampleRatio }
        : {}

  const status = options.successStatus ?? 200

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
   * What the program settled on. A client error (below 500) is an *answer*, not a
   * failure of the server span: it is carried here as a value so the span ends `Ok`
   * with `http.response.status_code` set, as OpenTelemetry asks for server spans, and
   * 404s and validation errors do not fill the error dashboards. Only 5xx and defects
   * fail the span.
   */
  type Outcome =
    | { readonly kind: 'reply'; readonly reply: Reply }
    | { readonly kind: 'refused'; readonly error: AppError }

  /**
   * Notes the trace this request belongs to, on success and on failure alike: remembered on the
   * event so the request log line, written after the fiber has finished, can join the same
   * trace, and (when traces are exported and this one was recorded) offered to the client as
   * `metadata.trace_id`, a `trc_` TypeID. A failed request needs it most.
   */
  const noteTrace = Effect.currentSpan.pipe(
    Effect.flatMap((span) =>
      Effect.sync(() => {
        event.context.trace = { traceId: span.traceId, spanId: span.spanId, sampled: span.sampled }
        if (!tracing.enabled || !span.sampled) return
        // The backend indexes the hex id; the `trc_` form is what clients and log lines show.
        // Putting it on the span too makes a pasted `trc_…` searchable there.
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

  const program = effect.pipe(
    Effect.provideService(CacheBypass, bypassCache),
    Effect.timeoutOrElse({
      duration: requestTimeout,
      orElse: () => Effect.fail(new RequestTimeout({ after: requestTimeout }))
    }),
    Effect.map((reply): Outcome => ({ kind: 'reply', reply })),
    Effect.catchIf(
      (error: AppError) => error.status < 500,
      (error): Effect.Effect<Outcome> => Effect.succeed({ kind: 'refused', error })
    ),
    Effect.tap((outcome) =>
      Effect.annotateCurrentSpan(
        'http.response.status_code',
        outcome.kind === 'reply' ? status : outcome.error.status
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

  const { diagnostics } = runtimeOf(event)

  const fail = (code: number, message: string, error: ApiErrorBody): ApiError => {
    event.res.status = code
    return errorEnvelope(event, code, message, error)
  }

  const failWith = (error: AppError): ApiError =>
    fail(error.status, error.clientMessage, errorBody(error, diagnostics))

  return runPromiseExit(program, { signal: event.req.signal }).then((exit) => {
    if (Exit.isSuccess(exit)) {
      const outcome = exit.value
      if (outcome.kind === 'refused') return failWith(outcome.error)
      event.res.status = status
      const body = successEnvelope(event, status, outcome.reply)
      const link = body.links === undefined ? undefined : linkHeader(body.links)
      if (link !== undefined) event.res.headers.set('link', link)
      return body
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      return fail(
        CLIENT_CLOSED_REQUEST,
        'Request cancelled',
        statusBody(CLIENT_CLOSED_REQUEST, { diagnostics })
      )
    }

    const failure: Option.Option<AppError> = Cause.findErrorOption(exit.cause)
    if (Option.isSome(failure)) return failWith(failure.value)

    return fail(500, 'Internal server error', defectBody(exit.cause, diagnostics))
  })
}
