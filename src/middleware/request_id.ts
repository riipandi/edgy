import { definePlugin, type H3Event } from 'h3'
import { runWithRequestId } from '../kernel/http/request_context.ts'
import { newId } from '../kernel/ids.ts'

/** Response header that carries the request id. */
export const REQUEST_ID_HEADER = 'x-request-id'

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
export const requestIdOf = (event: H3Event): string | undefined => event.context.requestId

/**
 * Request id plugin.
 *
 * Honours an inbound `x-request-id` (useful for distributed tracing) and
 * otherwise mints a fresh TypeID — a UUIDv7-based, sortable, prefixed id —
 * via `newId('request')`. The id is exposed to handlers as
 * `event.context.requestId` and echoed back on the response. The rest of the
 * request runs inside {@link runWithRequestId}, so code outside any fiber can
 * read it.
 *
 * The header is written to **both** `event.res.headers` and
 * `event.res.errHeaders`: h3 discards the former when an error response is
 * built (status >= 400 or a thrown error), merging only the latter, so setting
 * both keeps the id on every response.
 *
 * Register it before any middleware that reads {@link requestIdOf}.
 */
export const requestId = definePlugin((app) => {
  app.use((event, next) => {
    const id = inboundRequestId(event) ?? newId('request')

    event.context.requestId = id
    event.res.headers.set(REQUEST_ID_HEADER, id)
    event.res.errHeaders.set(REQUEST_ID_HEADER, id)

    return runWithRequestId(id, next)
  })
})
