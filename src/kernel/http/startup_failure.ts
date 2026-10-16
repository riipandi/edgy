import { RequestId } from '../../middleware/request_id.ts'
import { isApiPath } from './router.ts'

/** Seconds a client is told to wait; the next request tries to build the app again. */
const RETRY_AFTER = 5

/**
 * The answer when the application could not be built (a bad variable, a missing binding), so
 * there is no configuration, logger or error hook to render a page. Under `/api` it is the error
 * envelope's shape; elsewhere a short plain page. The request id is the one the failure is
 * logged under. Nothing about the cause reaches the client.
 */
export const startupFailureResponse = (
  request: Request
): { readonly response: Response; readonly requestId: string } => {
  const requestId = RequestId.make()
  const headers = {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'retry-after': String(RETRY_AFTER),
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId
  }
  const message = 'Service unavailable'

  if (isApiPath(new URL(request.url).pathname)) {
    const body = {
      status: 'error',
      message,
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
      metadata: { status_code: 503, request_id: requestId }
    }
    return {
      requestId,
      response: Response.json(body, { status: 503, headers })
    }
  }
  return {
    requestId,
    response: new Response(`${message} (request ${requestId})\n`, {
      status: 503,
      headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' }
    })
  }
}
