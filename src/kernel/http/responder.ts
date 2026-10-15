import { Cause, Effect, Exit, Option } from 'effect'
import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import { type AppError, RequestTimeout } from '../errors.ts'
import {
  type ApiError,
  type ApiSuccess,
  errorEnvelope,
  type Reply,
  successEnvelope
} from './envelope.ts'
import { type HttpEnv, runtimeOf } from './runtime.ts'

export interface RunOptions {
  /** Status for a successful response. Defaults to h3's `200`. */
  readonly successStatus?: number
}

/** Non-standard status (nginx) for a client that hung up before the response. */
const CLIENT_CLOSED_REQUEST = 499

interface Failure {
  readonly status: number
  readonly message: string
  /** Machine-readable detail for the `error` member; omitted when there is none. */
  readonly detail?: unknown
}

/** Maps a typed failure to a status code, a message and optional detail. */
const toFailure = (error: AppError): Failure => {
  switch (error._tag) {
    case 'ValidationError':
      return { status: 400, message: 'Validation failed', detail: error.issues }
    case 'NotFound':
      return { status: 404, message: `${error.resource} not found`, detail: { id: error.id } }
    case 'Conflict':
      return { status: 409, message: `${error.resource} already exists` }
    case 'RequestTimeout':
      return { status: 504, message: 'Request timed out' }
    case 'DatabaseError':
      return { status: 500, message: 'Database error' }
    default:
      return error satisfies never
  }
}

/**
 * Bridge Effect -> HTTP: run the program on the shared runtime and render the
 * outcome as the API envelope (`.llms/api-response.md`). Failures are narrowed
 * through `_tag`, so adding a member to `AppError` fails to compile here until
 * it has a branch.
 *
 * The program already yields an encoded {@link Reply}; this function owns
 * everything around it: the request timeout, interruption on client
 * disconnect, logging, and the success or error envelope with its status.
 *
 * The program runs inside a span named after the request, and its logs carry
 * the request id. Database failures and defects are logged with their cause —
 * the client only ever sees a generic 500 — while expected failures
 * (validation, not found) are not logged as errors.
 */
export const runEffect = <E extends AppError>(
  event: H3Event,
  effect: Effect.Effect<Reply, E, HttpEnv>,
  options: RunOptions = {}
): Promise<ApiSuccess | ApiError> => {
  const requestId = requestIdOf(event)
  const { requestTimeout, runPromiseExit } = runtimeOf(event)

  const program = effect.pipe(
    Effect.timeoutOrElse({
      duration: requestTimeout,
      orElse: () => Effect.fail(new RequestTimeout({ after: requestTimeout }))
    }),
    Effect.tapCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.void
      const failure = Cause.findErrorOption(cause)
      const expected = Option.isSome(failure) && failure.value._tag !== 'DatabaseError'
      return expected ? Effect.void : Effect.logError('Request failed', cause)
    }),
    Effect.annotateLogs(requestId === undefined ? {} : { requestId }),
    Effect.withSpan(`${event.req.method} ${event.url.pathname}`)
  )

  const fail = (status: number, message: string, detail?: unknown): ApiError => {
    event.res.status = status
    return errorEnvelope(event, status, message, detail)
  }

  return runPromiseExit(program, { signal: event.req.signal }).then((exit) => {
    if (Exit.isSuccess(exit)) {
      const status = options.successStatus ?? 200
      event.res.status = status
      return successEnvelope(event, status, exit.value)
    }

    if (Cause.hasInterruptsOnly(exit.cause)) return fail(CLIENT_CLOSED_REQUEST, 'Request cancelled')

    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isSome(failure)) {
      const { status, message, detail } = toFailure(failure.value)
      return fail(status, message, detail)
    }

    return fail(500, 'Internal server error')
  })
}
