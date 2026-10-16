import { definePlugin, type H3Event } from 'h3'
import { runWithRequestId } from '../kernel/http/request_context.ts'
import { defineId } from '../kernel/objectids.ts'

/** `req_…`: one HTTP request. */
export const RequestId = defineId('req')

export const REQUEST_ID_HEADER = 'x-request-id'

/** Longest inbound id that is echoed back. */
const MAX_REQUEST_ID_LENGTH = 128

/**
 * Allowed characters of an inbound id: those of a TypeID, UUID, ULID or opaque gateway token.
 * Anything else (spaces, `=`, quotes, control characters) is refused. The id is echoed in a
 * header and written raw to every log line of the request, so a client could otherwise forge
 * `key=value` pairs or whole lines.
 */
const INBOUND_ID = /^[A-Za-z0-9._:-]+$/

/**
 * Reads a caller-supplied id so an upstream service or gateway can seed the correlation chain.
 * Empty, oversized or oddly spelled values are ignored and a fresh id is minted.
 */
const inboundRequestId = (event: H3Event): string | undefined => {
  const value = event.req.headers.get(REQUEST_ID_HEADER)?.trim()
  if (!value || value.length > MAX_REQUEST_ID_LENGTH || !INBOUND_ID.test(value)) return undefined
  return value
}

/**
 * Returns the request id assigned to an event, if any. Read it through this helper rather
 * than `event.context`.
 */
export const requestIdOf = (event: H3Event): string | undefined => event.context.requestId

/**
 * Request id plugin. Honours an inbound `x-request-id` (for distributed tracing) and otherwise
 * mints a TypeID: UUIDv7-based, sortable and prefixed. The id is exposed as
 * `event.context.requestId` and echoed on the response. The rest of the request runs inside
 * {@link runWithRequestId}, so code outside any fiber can read it.
 *
 * The header goes to **both** `event.res.headers` and `event.res.errHeaders`. h3 discards the
 * former when it builds an error response (status >= 400 or a thrown error), so setting both
 * keeps the id on every response.
 *
 * Register it before any middleware that reads {@link requestIdOf}.
 */
export const requestId = definePlugin((app) => {
  app.use((event, next) => {
    const id = inboundRequestId(event) ?? RequestId.make()

    event.context.requestId = id
    event.res.headers.set(REQUEST_ID_HEADER, id)
    event.res.errHeaders.set(REQUEST_ID_HEADER, id)

    return runWithRequestId(id, next)
  })
})
