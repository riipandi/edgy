import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import type { PageSummary } from '../pagination.ts'
import { type ApiLinks, type ApiPagination, paginationLinks, paginationMeta } from './pagination.ts'

/** Rate-limit state of the caller; filled by a rate-limit middleware when one exists. */
export interface ApiRateLimit {
  /** Maximum requests allowed in the window. */
  readonly limit: number
  /** Left in the window; absent when the store only says allowed or refused (the Workers binding). */
  readonly remaining?: number
  /** Unix timestamp at which the window resets. */
  readonly reset: number
}

export interface ApiErrorMetadata {
  readonly status_code: number
  readonly request_id: string
  /** The `trc_` id of the recorded trace; set only when traces are exported and this one was recorded. */
  readonly trace_id?: string
  /** Present on every response under the rate limiter, a `429` included. */
  readonly rate_limit?: ApiRateLimit
}

export interface ApiMetadata extends ApiErrorMetadata, Partial<ApiPagination> {}

/** `{ status: 'success' }` body. `data` and `links` are omitted when empty. */
export interface ApiSuccess {
  readonly status: 'success'
  readonly message?: string
  readonly data?: unknown
  readonly metadata: ApiMetadata
  readonly links?: ApiLinks
}

/**
 * What lies behind a server-side failure. Present only at `LOG_LEVEL=Debug` or below, and always
 * redacted (see `error_body.ts`).
 */
export interface ApiErrorDebug {
  /** The error's tag (`DatabaseError`), or `Defect` for an unexpected exception. */
  readonly type: string
  readonly message?: string
}

/** The `error` member: machine-readable, never internals (except `debug`, when enabled). */
export interface ApiErrorBody {
  /** Stable identifier of the failure, for clients to switch on (`NOT_FOUND`, `RATE_LIMITED`). */
  readonly code: string
  /** Whether sending the same request again can succeed. */
  readonly retryable: boolean
  /** Per-error facts: the validation issues, the id that was not found, `retry_after`. */
  readonly details?: unknown
  readonly debug?: ApiErrorDebug
}

/** `{ status: 'error' }` body. */
export interface ApiError {
  readonly status: 'error'
  readonly message: string
  readonly error: ApiErrorBody
  readonly metadata: ApiErrorMetadata
}

/**
 * What a handler program produces, already encoded through its response
 * schema: the `data` member plus, for a collection, the page it came from.
 */
export interface Reply {
  /** Omitted from the body when `undefined`. */
  readonly data?: unknown
  readonly message?: string
  readonly pagination?: PageSummary
}

/** `trace_id` when this request's trace was recorded (see `runEffect`). */
const traceMeta = (event: H3Event): { readonly trace_id?: string } => {
  const id = event.context.traceTypeId
  return id === undefined ? {} : { trace_id: id }
}

/** The id minted by the `requestId` plugin; `unknown` only if that plugin was not registered. */
const requestIdFor = (event: H3Event): string => requestIdOf(event) ?? 'unknown'

/**
 * Wraps a reply in the success envelope. Pagination fields are spread into
 * `metadata` and the link map is added only for collections.
 */
export const successEnvelope = (event: H3Event, statusCode: number, reply: Reply): ApiSuccess => {
  const rateLimit = event.context.rateLimit
  const base = {
    status_code: statusCode,
    request_id: requestIdFor(event),
    ...traceMeta(event),
    ...(rateLimit === undefined ? {} : { rate_limit: rateLimit })
  }
  const body = {
    status: 'success' as const,
    ...(reply.message === undefined ? {} : { message: reply.message }),
    ...(reply.data === undefined ? {} : { data: reply.data })
  }
  if (reply.pagination === undefined) return { ...body, metadata: base }

  const pagination = paginationMeta(reply.pagination)
  return {
    ...body,
    metadata: { ...base, ...pagination },
    links: paginationLinks(event.url, pagination)
  }
}

export const errorEnvelope = (
  event: H3Event,
  statusCode: number,
  message: string,
  error: ApiErrorBody
): ApiError => {
  event.context.errorCode = error.code
  return {
    status: 'error',
    message,
    error,
    metadata: {
      status_code: statusCode,
      request_id: requestIdFor(event),
      ...traceMeta(event),
      ...(event.context.rateLimit === undefined ? {} : { rate_limit: event.context.rateLimit })
    }
  }
}

/**
 * The `Link` header (RFC 8288) for a link map, so a client that follows headers instead of the
 * body finds the same `next`/`prev`/`first`/`last`. `null` relations are left out.
 */
export const linkHeader = (links: ApiLinks): string | undefined => {
  const parts = Object.entries(links).flatMap(([rel, url]) =>
    url === null || url === undefined ? [] : [`<${url}>; rel="${rel}"`]
  )
  return parts.length === 0 ? undefined : parts.join(', ')
}
