import type { H3Event, HTTPError } from 'h3'
import { errorEnvelope } from './envelope.ts'

/**
 * Renders errors raised by h3 itself (unknown route, malformed JSON, body too
 * large, a thrown exception) in the same error envelope `runEffect` uses, so
 * clients parse one error format.
 *
 * Messages of unhandled exceptions are replaced: only the log, never the
 * response, carries internals. The `Response` is built here, with the event's
 * `errHeaders` copied in, because h3 does not merge them into a response
 * returned from the error hook — without the copy CORS and `x-request-id`
 * would vanish from exactly the responses that need them.
 */
export const renderHTTPError = (error: HTTPError, event: H3Event): Response => {
  const message =
    error.status === 404
      ? 'Not found'
      : error.unhandled === true
        ? 'Internal server error'
        : error.message

  const headers = new Headers(event.res.errHeaders)
  headers.set('content-type', 'application/json; charset=utf-8')

  return new Response(JSON.stringify(errorEnvelope(event, error.status, message)), {
    status: error.status,
    headers
  })
}
