import type { H3Event, HTTPError } from 'h3'
import { errorEnvelope } from './envelope.ts'
import { statusBody } from './error_body.ts'

/** What a client may be told about an error h3 raised: never the message of an unhandled one. */
export const publicMessage = (error: HTTPError): string =>
  error.status === 404
    ? 'Not found'
    : error.unhandled === true
      ? 'Internal server error'
      : error.message

/**
 * Renders errors raised by h3 in the same envelope as application errors, so clients parse one
 * format. Unhandled exceptions get a generic message; only the log carries their internals.
 *
 * h3 does not merge `errHeaders` into a `Response` returned from the error hook, so they are
 * copied here, or CORS and `x-request-id` vanish from exactly these responses.
 */
export const renderHTTPError = (error: HTTPError, event: H3Event): Response => {
  const message = publicMessage(error)

  const headers = new Headers(event.res.errHeaders)
  headers.set('content-type', 'application/json; charset=utf-8')

  const retryAfter = Number(headers.get('retry-after'))
  const body = statusBody(error.status, {
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    unhandled:
      error.unhandled === true ? { type: 'UnhandledError', failure: error.cause } : undefined,
    // Set by the first plugin; only a failure raised before it has no runtime.
    diagnostics: event.context.runtime?.diagnostics ?? false
  })

  return new Response(JSON.stringify(errorEnvelope(event, error.status, message, body)), {
    status: error.status,
    headers
  })
}
