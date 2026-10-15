import { Cause } from 'effect'
import type { AppError } from '../errors.ts'
import { describeFailure, redactValue } from '../redact.ts'
import type { ApiErrorBody, ApiErrorDebug } from './envelope.ts'

/**
 * What a client is told about a failure, in the `error` member of the error envelope.
 *
 * `code`, `retryable` and `details` are always there and always safe: the error chose them for
 * the client. `debug` is the exception. It carries what lies behind a server-side failure (the
 * driver's own message, an unexpected exception's) and appears only when `diagnostics` is on,
 * which is when the logger is at `Debug` or below, so the response is exactly as chatty as the
 * log. Whatever it carries is redacted first: a connection string in a driver's complaint must not
 * reach a browser, not even in development.
 */
const debugOf = (type: string, failure: unknown): ApiErrorDebug => {
  const message = describeFailure(failure)
  return message === '' ? { type } : { type, message }
}

/** The `error` member for a failure the application raised on purpose. */
export const errorBody = (error: AppError, diagnostics: boolean): ApiErrorBody => ({
  code: error.code,
  retryable: error.retryable,
  ...(error.detail === undefined ? {} : { details: redactValue(error.detail) }),
  ...(diagnostics && error.status >= 500 ? { debug: debugOf(error._tag, error.cause) } : {})
})

/** The `error` member for a failure nobody planned for (a defect): the server's fault, 500. */
export const defectBody = (cause: Cause.Cause<unknown>, diagnostics: boolean): ApiErrorBody => ({
  code: 'INTERNAL_ERROR',
  retryable: false,
  ...(diagnostics ? { debug: debugOf('Defect', Cause.squash(cause)) } : {})
})

/** The code for a status no `AppError` produced; also what the request log shows for it. */
export const codeForStatus = (status: number): string => STATUS_CODES[status] ?? `HTTP_${status}`

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  408: 'REQUEST_TIMEOUT',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  499: 'CLIENT_CLOSED_REQUEST',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT'
}

/** Statuses after which the same request may well succeed. */
const RETRYABLE = new Set([408, 429, 502, 503, 504])

/**
 * The `error` member for an error h3 raised itself (an unknown path, malformed JSON, a body over
 * the limit) or a middleware threw (`429`, `503`): there is no `AppError`, so the code comes
 * from the status. `retryAfter` is the `Retry-After` the response already carries, repeated here
 * so a client that reads only the body can honour it.
 */
export const statusBody = (
  status: number,
  options: {
    readonly retryAfter?: number | undefined
    readonly unhandled?: { readonly type: string; readonly failure: unknown } | undefined
    readonly diagnostics: boolean
  }
): ApiErrorBody => ({
  code: codeForStatus(status),
  retryable: RETRYABLE.has(status),
  ...(options.retryAfter === undefined ? {} : { details: { retry_after: options.retryAfter } }),
  ...(options.diagnostics && options.unhandled !== undefined
    ? { debug: debugOf(options.unhandled.type, options.unhandled.failure) }
    : {})
})
