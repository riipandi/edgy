import { Effect } from 'effect'
import { Metric } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { httpRequests } from '../observer/metrics.ts'
import { REQUEST_ID_HEADER, requestIdFrom } from './request-id.ts'

export const requestLog = HttpRouter.use((router) =>
  router.addGlobalMiddleware((effect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const header = request.headers[REQUEST_ID_HEADER]
      const requestId = header !== undefined ? requestIdFrom(header) : undefined
      const started = Date.now()
      const response = yield* effect
      yield* Metric.update(httpRequests, 1)
      yield* Effect.logInfo(
        `${request.method} ${request.originalUrl} ${response.status} ${Date.now() - started}ms req=${
          requestId?.toString() ?? '-'
        }`
      )
      return response
    })
  )
)
