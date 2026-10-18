import * as HttpServerResponse from 'effect/http/HttpServerResponse'

export const health = HttpServerResponse.jsonUnsafe({ status: 'ok' })
