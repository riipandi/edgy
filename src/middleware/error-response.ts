import { Cause, Effect, Exit } from 'effect'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerError from 'effect/http/HttpServerError'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { AppConfig } from '#/kernel/config/config.ts'
import { ApiInternalError, ApiNotFoundError, ApiValidationError } from '#/kernel/http/errors.ts'
import { errorBody } from '#/kernel/http/respond.ts'

const respond = (status: number, body: unknown): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(body, { status })

// Effect HttpApi turns request-decode failures and unhandled defects into
// die-level causes that the platform answers with an empty body. Every /api
// request deserves the same envelope a declared endpoint error gets, so this
// middleware reshapes those causes into one: a decode failure names the
// failing part, an unmatched path answers NotFound, and anything else
// answers as an internal server error. Declared endpoint errors are encoded
// upstream and never get here. Responses outside /api pass through
// untouched — pages stay HTML.
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
            const body = yield* errorBody(
              new ApiValidationError({
                code: 'VALIDATION_FAILED',
                retryable: false,
                details: { kind: defect.kind, issue: defect.cause.message }
              }),
              400,
              'Request validation failed'
            )
            return respond(400, body)
          }
          if (HttpServerError.isHttpServerError(defect)) {
            const reason = defect.reason
            if (reason._tag === 'RouteNotFound') {
              const body = yield* errorBody(
                new ApiNotFoundError({ code: 'NOT_FOUND', retryable: false }),
                404,
                'Not found'
              )
              return respond(404, body)
            }
            if (reason._tag === 'RequestParseError') {
              const tooLarge = reason.reason === 'BodyTooLarge'
              const body = yield* errorBody(
                new ApiValidationError({
                  code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
                  retryable: false
                }),
                tooLarge ? 413 : 400,
                tooLarge ? 'Payload too large' : 'Bad request'
              )
              return respond(tooLarge ? 413 : 400, body)
            }
          }
          const body = yield* errorBody(
            new ApiInternalError({ code: 'INTERNAL_ERROR', retryable: false }),
            500,
            'An unexpected error occurred'
          )
          return respond(500, body)
        })
      )
    )
  )
)
