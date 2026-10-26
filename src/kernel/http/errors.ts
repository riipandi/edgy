import { Schema } from 'effect'
import 'effect/http-api/HttpApiSchema'

// Generic, reusable HTTP-semantic errors — not one bespoke class per domain
// concept. A module constructs one of these with its own `code` and
// `details` instead of declaring a new tagged class per failure mode. Each
// carries the httpApiStatus annotation Effect's own HttpApiError built-ins
// use, so an endpoint's error set needs no separate `.pipe(HttpApiSchema.status(...))`.

const ErrorDebug = Schema.Struct({
  type: Schema.String,
  message: Schema.optional(Schema.String)
})

const apiErrorFields = {
  code: Schema.String,
  retryable: Schema.Boolean,
  details: Schema.optional(Schema.Unknown),
  debug: Schema.optional(ErrorDebug)
}

export class ApiValidationError extends Schema.TaggedError<ApiValidationError>()(
  'ApiValidationError',
  apiErrorFields,
  { httpApiStatus: 400 }
) {}

export class ApiNotFoundError extends Schema.TaggedError<ApiNotFoundError>()(
  'ApiNotFoundError',
  apiErrorFields,
  { httpApiStatus: 404 }
) {}

export class ApiConflictError extends Schema.TaggedError<ApiConflictError>()(
  'ApiConflictError',
  apiErrorFields,
  { httpApiStatus: 409 }
) {}

export class ApiRateLimitedError extends Schema.TaggedError<ApiRateLimitedError>()(
  'ApiRateLimitedError',
  apiErrorFields,
  { httpApiStatus: 429 }
) {}

export class ApiInternalError extends Schema.TaggedError<ApiInternalError>()(
  'ApiInternalError',
  apiErrorFields,
  { httpApiStatus: 500 }
) {}

export class ApiServiceUnavailableError extends Schema.TaggedError<ApiServiceUnavailableError>()(
  'ApiServiceUnavailableError',
  apiErrorFields,
  { httpApiStatus: 503 }
) {}
