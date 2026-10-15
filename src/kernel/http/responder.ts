import { Cause, Effect, Exit, Option, Schema } from 'effect'
import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import { type AppError, RequestTimeout, type ValidationIssue } from '../errors.ts'
import { type HttpEnv, runtimeOf } from './runtime.ts'

/**
 * Typed JSON body shapes for error responses (mapped from error tags below).
 * All handler return types are concrete objects, never `unknown`.
 */
export interface ErrorResponse {
  readonly error: string
  readonly id?: number
}

export interface ValidationErrorResponse {
  readonly error: 'Validation failed'
  readonly issues: ReadonlyArray<ValidationIssue>
}

export interface RunOptions<A, I> {
  /**
   * Schema the success value is encoded through. Only its declared fields reach
   * the client, and the encoded shape is what the response type reports.
   */
  readonly response: Schema.Codec<A, I>
  /** Status for a successful response. Defaults to h3's `200`. */
  readonly successStatus?: number
}

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

/** Maps a typed failure to a status code and a concrete JSON body. */
const toErrorResponse = (error: AppError): [number, ErrorResponse | ValidationErrorResponse] => {
  switch (error._tag) {
    case 'ValidationError':
      return [400, { error: 'Validation failed', issues: error.issues }]
    case 'NotFound':
      return [404, { error: 'User not found', id: error.id }]
    case 'Conflict':
      return [409, { error: `${error.resource} already exists` }]
    case 'RequestTimeout':
      return [504, { error: 'Request timed out' }]
    case 'DatabaseError':
      return [500, { error: 'Database error' }]
    default:
      return error satisfies never
  }
}

/**
 * Bridge Effect -> HTTP: run the program on the shared runtime and map typed
 * errors to response status codes. Failures are narrowed through `_tag`, so
 * adding a member to `AppError` fails to compile here until it has a branch.
 *
 * The success value is encoded through `options.response`. An encode failure
 * means the handler produced something its own contract forbids, so it is a
 * defect (500), not a client error.
 *
 * The program runs inside a span named after the request, and its logs carry
 * the request id. Database failures and defects are logged with their cause —
 * the client only ever sees a generic 500 — while expected failures
 * (validation, not found) are not logged as errors.
 */
export const runEffect = <A, I, E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<A, E, HttpEnv>,
  options: RunOptions<A, I>
): Promise<I | ValidationErrorResponse | ErrorResponse> => {
  const requestId = requestIdOf(event)
  const encode = Schema.encodeEffect(options.response)

  const { requestTimeout, runPromiseExit } = runtimeOf(event)

  const program = effect.pipe(
    Effect.timeoutOrElse({
      duration: requestTimeout,
      orElse: () => Effect.fail(new RequestTimeout({ after: requestTimeout }))
    }),
    Effect.flatMap((value) => Effect.orDie(encode(value))),
    Effect.tapCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.void
      const failure = Cause.findErrorOption(cause)
      const expected = Option.isSome(failure) && failure.value._tag !== 'DatabaseError'
      return expected ? Effect.void : Effect.logError('Request failed', cause)
    }),
    Effect.annotateLogs(requestId === undefined ? {} : { requestId }),
    Effect.withSpan(`${event.req.method} ${event.url.pathname}`)
  )

  return runPromiseExit(program, { signal: event.req.signal }).then((exit) => {
    if (Exit.isSuccess(exit)) {
      if (options.successStatus !== undefined) event.res.status = options.successStatus
      return exit.value
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      event.res.status = CLIENT_CLOSED_REQUEST
      return { error: 'Request cancelled' } satisfies ErrorResponse
    }

    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isSome(failure)) {
      const [status, body] = toErrorResponse(failure.value)
      event.res.status = status
      return body
    }

    event.res.status = 500
    return { error: 'Internal server error' } satisfies ErrorResponse
  })
}
