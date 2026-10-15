import type { H3Event } from 'h3'
import { requestIdOf } from '../../middleware/request_id.ts'
import type { PageSummary } from '../pagination.ts'
import { type ApiLinks, type ApiPagination, paginationLinks, paginationMeta } from './pagination.ts'

/** Rate-limit state of the caller; filled by a rate-limit middleware when one exists. */
export interface ApiRateLimit {
  readonly limit: number
  readonly remaining: number
  /** Unix timestamp at which the window resets. */
  readonly reset: number
}

export interface ApiErrorMetadata {
  readonly status_code: number
  readonly request_id: string
}

export interface ApiMetadata extends ApiErrorMetadata, Partial<ApiPagination> {
  readonly trace_id?: string
  readonly rate_limit?: ApiRateLimit
}

/** `{ status: 'success' }` body. `data` and `links` are omitted when empty. */
export interface ApiSuccess {
  readonly status: 'success'
  readonly message?: string
  readonly data?: unknown
  readonly metadata: ApiMetadata
  readonly links?: ApiLinks
}

/** `{ status: 'error' }` body. `error` carries machine-readable detail, never internals. */
export interface ApiError {
  readonly status: 'error'
  readonly message: string
  readonly error?: unknown
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
  error?: unknown
): ApiError => ({
  status: 'error',
  message,
  ...(error === undefined ? {} : { error }),
  metadata: { status_code: statusCode, request_id: requestIdFor(event) }
})
