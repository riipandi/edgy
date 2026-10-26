import { Schema } from 'effect'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'

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

// The generic is bound to Schema.Top, not the narrower Schema.Schema<A> —
// the latter only tracks the decoded type and erases the richer Codec shape
// HttpApi's own type machinery needs, which otherwise makes the endpoint's
// inferred requirements collapse to `unknown` instead of `never` wherever
// the composed Layer is consumed (cli.ts, main.ts).
export const SuccessEnvelope = <S extends Schema.Top>(data: S) =>
  Schema.Struct({
    status: Schema.Literal('success'),
    message: Schema.optional(Schema.String),
    data: Schema.optional(data),
    metadata: Metadata,
    links: Schema.optional(Links)
  })

// The status code is explicit here rather than read off `error`'s own
// annotation: httpApiStatus is a per-schema-node annotation, so wrapping a
// class in this struct would otherwise lose it — the outer struct is what
// HttpApi actually inspects for the error set's status.
export const ErrorEnvelope = <S extends Schema.Top>(error: S, statusCode: number) =>
  Schema.Struct({
    status: Schema.Literal('error'),
    message: Schema.String,
    error,
    metadata: Metadata
  }).pipe(HttpApiSchema.status(statusCode))

// A success response with nothing to return (a delete) — the envelope always
// carries a JSON body, so there is no 204 No Content variant of it.
export const EmptySuccessEnvelope = SuccessEnvelope(Schema.Void)
