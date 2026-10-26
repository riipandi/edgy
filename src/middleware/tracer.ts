import * as HttpMiddleware from 'effect/http/HttpMiddleware'
import * as HttpRouter from 'effect/http/HttpRouter'

// A server span per request; incoming W3C traceparent links it to the caller,
// and header redaction follows the framework's redaction config.
export const requestTracerMiddleware = HttpRouter.middleware(HttpMiddleware.tracer, {
  global: true
})
