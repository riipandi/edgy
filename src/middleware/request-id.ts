import { Effect } from 'effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { TypeID, typeid } from 'typeid-js'

export const REQUEST_ID_HEADER = 'x-request-id'

export type RequestId = TypeID<'req'>

export const newRequestId = (): RequestId => typeid('req') satisfies RequestId

export const requestIdFrom = (value: string): RequestId | undefined => {
  try {
    return TypeID.fromString(value, 'req') as RequestId
  } catch {
    return undefined
  }
}

// Assigns a TypeID prefixed `req_` to every request. An incoming
// x-request-id header wins when it parses; the id echoes back on the
// response so clients and logs can correlate them.
export const requestId = HttpRouter.use((router) =>
  router.addGlobalMiddleware((effect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const header = request.headers[REQUEST_ID_HEADER]
      const id = (header !== undefined ? requestIdFrom(header) : undefined) ?? newRequestId()
      const response = yield* effect
      return HttpServerResponse.setHeader(REQUEST_ID_HEADER, id.toString())(response)
    })
  )
)
