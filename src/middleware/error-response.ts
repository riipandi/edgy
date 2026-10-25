import { Cause, Effect, Exit } from 'effect'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerError from 'effect/http/HttpServerError'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { AppConfig } from '#/kernel/config/config.ts'

const respond = (
  status: number,
  body: Record<string, unknown>
): HttpServerResponse.HttpServerResponse => HttpServerResponse.jsonUnsafe(body, { status })

// Effect HttpApi turns request-decode failures and unhandled defects into
// die-level causes that the platform answers with an empty body. Every /api
// request deserves a JSON answer, so this middleware reshapes those causes:
// a decode failure names the failing part and carries the issue message, an
// unmatched path answers NotFound, and anything else answers as an internal
// server error. Declared endpoint errors are encoded upstream and never get
// here. Responses outside /api pass through untouched — pages stay HTML.
export const errorResponseMiddleware = HttpRouter.use((router) =>
  Effect.map(AppConfig, (config) => config.app.baseUrl).pipe(
    Effect.flatMap((baseUrl) =>
      router.addGlobalMiddleware((effect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const path = new URL(request.originalUrl, baseUrl).pathname
          if (!path.startsWith('/api/')) return yield* effect
          const outcome = yield* Effect.exit(effect)
          if (Exit.isSuccess(outcome)) return outcome.value
          const defect = Cause.squash(outcome.cause)
          if (HttpApiError.HttpApiSchemaError.is(defect)) {
            return respond(400, {
              _tag: 'HttpApiDecodeError',
              kind: defect.kind,
              message: defect.cause.message
            })
          }
          if (HttpServerError.isHttpServerError(defect)) {
            const reason = defect.reason
            if (reason._tag === 'RouteNotFound') return respond(404, { _tag: 'NotFound' })
            if (reason._tag === 'RequestParseError') {
              return respond(reason.reason === 'BodyTooLarge' ? 413 : 400, { _tag: 'BadRequest' })
            }
          }
          return respond(500, { _tag: 'InternalServerError' })
        })
      )
    )
  )
)
