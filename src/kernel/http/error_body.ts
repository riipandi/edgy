import { Cause } from 'effect'
import type { AppError } from '../errors.ts'
import { describeFailure, redactValue } from '../redact.ts'
import type { ApiErrorBody, ApiErrorDebug } from './envelope.ts'

/**
 * The `error` member of a failure response. `code`, `retryable` and `details` are always safe to
 * send. `debug` carries what lies behind a server-side failure, and only when `diagnostics` is on
 * (the logger is at `Debug` or below). It is always redacted: a connection string in a driver's
 * message must not reach a browser, even in development.
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

/** The code for a status with no `AppError`. The request log shows the same code. */
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
 * The `error` member for an h3 or middleware error, which has no `AppError`, so the code comes
 * from the status. `retryAfter` is repeated in the body for clients that read only the body.
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
