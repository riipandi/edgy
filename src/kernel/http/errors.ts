import { Schema } from 'effect'

// Generic, reusable HTTP-semantic errors — not one bespoke class per domain
// concept. A module constructs one of these with its own `code` and
// `details` instead of declaring a new tagged class per failure mode. The
// HTTP status is not carried here — ErrorEnvelope (kernel/http/envelope.ts)
// sets it explicitly per endpoint, since an annotation on this inner class
// would not propagate to the outer envelope struct HttpApi inspects.

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
  apiErrorFields
) {}

export class ApiNotFoundError extends Schema.TaggedError<ApiNotFoundError>()(
  'ApiNotFoundError',
  apiErrorFields
) {}

export class ApiConflictError extends Schema.TaggedError<ApiConflictError>()(
  'ApiConflictError',
  apiErrorFields
) {}

export class ApiRateLimitedError extends Schema.TaggedError<ApiRateLimitedError>()(
  'ApiRateLimitedError',
  apiErrorFields
) {}

export class ApiInternalError extends Schema.TaggedError<ApiInternalError>()(
  'ApiInternalError',
  apiErrorFields
) {}

export class ApiServiceUnavailableError extends Schema.TaggedError<ApiServiceUnavailableError>()(
  'ApiServiceUnavailableError',
  apiErrorFields
) {}
