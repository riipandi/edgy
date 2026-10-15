import type { H3Event, HTTPError } from 'h3'
import { publicMessage, renderHTTPError } from './errors.ts'
import { type HtmlTemplate, htmlResponse } from './html_response.ts'
import { isApiPath } from './router.ts'

/** What the error page is told: enough for a person to describe the problem, nothing internal. */
export interface ErrorPageInput {
  readonly status: number
  readonly message: string
  /** The `req_` id, which is what support asks for and the logs are searched by. */
  readonly requestId?: string
  /** Seconds, for a `429` or `503` that says when to come back. */
  readonly retryAfter?: number
}

/**
 * The `onError` hook. Under `/api` the error is the JSON envelope; elsewhere it is an HTML page.
 * One hook serves both because h3 raises the same `HTTPError` for every failure, and only the
 * path says who is reading.
 *
 * The page loads per request. If it cannot render, the JSON envelope answers instead, so a broken
 * page never hides the error.
 */
export const makeErrorHandler =
  (loadPage: () => Promise<{ readonly default: HtmlTemplate<ErrorPageInput> }>) =>
  async (error: HTTPError, event: H3Event): Promise<Response> => {
    if (isApiPath(event.url.pathname)) return renderHTTPError(error, event)

    try {
      const { default: template } = await loadPage()
      const retryAfter = Number(event.res.errHeaders.get('retry-after'))
      const { requestId } = event.context
      return htmlResponse(
        event,
        template,
        {
          status: error.status,
          message: publicMessage(error),
          ...(requestId === undefined ? {} : { requestId }),
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {})
        },
        // h3 builds an error response from `errHeaders` only, so copy them or the request id,
        // CORS and rate-limit headers are lost.
        { status: error.status, headers: new Headers(event.res.errHeaders) }
      )
    } catch {
      return renderHTTPError(error, event)
    }
  }
