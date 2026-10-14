import { definePlugin, type H3Event, onRequest } from 'h3'
import { typeid } from 'typeid-js'

/** Response header that carries the request id. */
export const REQUEST_ID_HEADER = 'x-request-id'

/** TypeID prefix used for generated ids, producing values like `req_01h…`. */
const REQUEST_ID_PREFIX = 'req'

/** Longest inbound id that will be echoed back; guards against absurd values. */
const MAX_REQUEST_ID_LENGTH = 128

/**
 * Reads a caller-supplied id, so an upstream service (or a gateway) can seed
 * the correlation chain. Empty or oversized values are ignored.
 */
const inboundRequestId = (event: H3Event): string | undefined => {
  const value = event.req.headers.get(REQUEST_ID_HEADER)?.trim()
  if (!value || value.length > MAX_REQUEST_ID_LENGTH) return undefined
  return value
}

/**
 * Returns the request id assigned to an event, if any.
 *
 * Handlers and other middleware read the id through this helper rather than
 * touching `event.context` directly.
 */
export const requestIdOf = (event: H3Event): string | undefined => {
  const id = event.context.requestId
  return typeof id === 'string' ? id : undefined
}

/**
 * Request id plugin.
 *
 * Honours an inbound `x-request-id` (useful for distributed tracing) and
 * otherwise mints a fresh TypeID — a UUIDv7-based, sortable, prefixed id —
 * via `typeid('req')`. The id is exposed to handlers as
 * `event.context.requestId` and echoed back on the response.
 *
 * The header is written to **both** `event.res.headers` and
 * `event.res.errHeaders`: h3 discards the former when an error response is
 * built (status >= 400 or a thrown error), merging only the latter, so setting
 * both keeps the id on every response.
 *
 * Register it before any middleware that reads {@link requestIdOf}.
 */
export const requestId = definePlugin((app) => {
  app.use(
    onRequest((event) => {
      const id = inboundRequestId(event) ?? typeid(REQUEST_ID_PREFIX).toString()

      event.context.requestId = id
      event.res.headers.set(REQUEST_ID_HEADER, id)
      event.res.errHeaders.set(REQUEST_ID_HEADER, id)
    })
  )
})
