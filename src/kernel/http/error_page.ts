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
 * The application's `onError` hook: an error under `/api` is the JSON envelope, any other path is
 * an HTML error page. One hook for both because h3 raises the same `HTTPError` for an unknown
 * path, a failed page, a malformed body and a thrown exception, and only the path says who is
 * reading.
 *
 * The page is loaded per request (the same reason pages are, see `definePageHandler`). If it cannot
 * be rendered, the JSON envelope answers instead: an error page that fails must not hide the error.
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
        // h3 builds an error response from `errHeaders` only: copy them, or the request id,
        // CORS and the rate-limit headers vanish from exactly the responses that need them.
        { status: error.status, headers: new Headers(event.res.errHeaders) }
      )
    } catch {
      return renderHTTPError(error, event)
    }
  }
