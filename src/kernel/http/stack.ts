import { Layer } from 'effect'
import { corsMiddleware } from '#/middleware/cors.ts'
import { errorResponseMiddleware } from '#/middleware/error-response.ts'
import { requestIdMiddleware } from '#/middleware/request-id.ts'
import { requestLogMiddleware } from '#/middleware/request-log.ts'
import { securityHeadersMiddleware } from '#/middleware/security-headers.ts'
import { requestTracerMiddleware } from '#/middleware/tracer.ts'
import { trustProxyMiddleware } from '#/middleware/trust-proxy.ts'

// The single owner of the middleware order, so the serve composition and the
// dev handler cannot drift apart again. The order follows the serve
// composition; routes (apiRoutes, ssr, metrics) are passed by the caller and
// sit between cors and request-id, where the serve composition already kept
// them.
export const httpStack = <Layers extends ReadonlyArray<Layer.Layer<never, any, any>>>(
  ...routes: Layers
) =>
  Layer.mergeAll(
    trustProxyMiddleware,
    requestTracerMiddleware,
    corsMiddleware,
    ...routes,
    requestIdMiddleware,
    errorResponseMiddleware,
    requestLogMiddleware(),
    securityHeadersMiddleware
  )
