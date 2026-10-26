import { Schema } from 'effect'

// Per .llms/api-response.md. Every /api/* success or error body is one of
// these two shapes — no bare domain payload and no flat {"_tag":...} body.

export const ApiRateLimit = Schema.Struct({
  limit: Schema.Number,
  remaining: Schema.optional(Schema.Number),
  reset: Schema.Number
})

export const CacheStatus = Schema.Literals(['hit', 'miss', 'bypass', 'disabled'])

// ApiPagination's fields are spread directly into Metadata, not nested, per
// the spec's "...ApiPagination" note.
export const Metadata = Schema.Struct({
  status_code: Schema.Number,
  request_id: Schema.String,
  trace_id: Schema.optional(Schema.String),
  rate_limit: Schema.optional(ApiRateLimit),
  cache: Schema.optional(CacheStatus),
  limit: Schema.optional(Schema.Number),
  has_more: Schema.optional(Schema.Boolean),
  next_cursor: Schema.optional(Schema.NullOr(Schema.String))
})

export const Links = Schema.NullOr(Schema.Record(Schema.String, Schema.NullOr(Schema.String)))

export const SuccessEnvelope = <A>(data: Schema.Schema<A>) =>
  Schema.Struct({
    status: Schema.Literal('success'),
    message: Schema.optional(Schema.String),
    data: Schema.optional(data),
    metadata: Metadata,
    links: Schema.optional(Links)
  })

export const ErrorEnvelope = <A>(error: Schema.Schema<A>) =>
  Schema.Struct({
    status: Schema.Literal('error'),
    message: Schema.String,
    error,
    metadata: Metadata
  })
