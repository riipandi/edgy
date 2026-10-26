import { Clock, Effect, Option } from 'effect'
import type { CacheStatus } from '#/kernel/cache.ts'
import type { ConsumeVerdict } from '#/middleware/rate-limit.ts'
import { RateLimitVerdict, RequestId } from './request-context.ts'

export interface Pagination {
  readonly limit?: number
  readonly hasMore?: boolean
  readonly nextCursor?: string | null
}

interface RespondOptions {
  readonly message?: string
  readonly cache?: CacheStatus
  readonly pagination?: Pagination
}

export interface ApiRateLimitShape {
  readonly limit: number
  readonly remaining: number
  readonly reset: number
}

export interface Metadata {
  status_code: number
  request_id: string
  trace_id?: string
  rate_limit?: ApiRateLimitShape
  cache?: CacheStatus
  limit?: number
  has_more?: boolean
  next_cursor?: string | null
}

export interface SuccessBody<A> {
  status: 'success'
  message?: string
  data?: A
  metadata: Metadata
  links?: Record<string, string | null> | null
}

export interface ErrorBody<E> {
  readonly status: 'error'
  readonly message: string
  readonly error: E
  readonly metadata: Metadata
}

// trace_id has no source until a span is active; absent outside a traced
// request (a unit test, a fixture) rather than failing the response.
const currentTraceId = Effect.currentSpan.pipe(
  Effect.map((span) => Option.some(span.traceId)),
  Effect.catch(() => Effect.succeed(Option.none<string>()))
)

const toApiRateLimit = (verdict: ConsumeVerdict) =>
  Effect.map(Clock.currentTimeMillis, (now): ApiRateLimitShape => ({
    limit: verdict.limit,
    remaining: verdict.remaining,
    reset: Math.floor(now / 1000) + verdict.resetSeconds
  }))

// Reads the ambient request-id/rate-limit/span data every success and error
// response shares, so a handler never assembles it by hand. Fields are
// assigned conditionally rather than spread so the result stays one shape —
// a chain of conditional spreads infers a union of partial object types,
// which is precise but expensive for the compiler to carry through the rest
// of the HttpApi/Layer graph.
const buildMetadata = (statusCode: number, options?: RespondOptions): Effect.Effect<Metadata> =>
  Effect.gen(function* () {
    const metadata: Metadata = { status_code: statusCode, request_id: yield* RequestId }
    const traceId = yield* currentTraceId
    if (Option.isSome(traceId)) metadata.trace_id = traceId.value
    const verdict = yield* RateLimitVerdict
    if (Option.isSome(verdict)) metadata.rate_limit = yield* toApiRateLimit(verdict.value)
    if (options?.cache !== undefined) metadata.cache = options.cache
    if (options?.pagination?.limit !== undefined) metadata.limit = options.pagination.limit
    if (options?.pagination?.hasMore !== undefined) metadata.has_more = options.pagination.hasMore
    if (options?.pagination?.nextCursor !== undefined)
      metadata.next_cursor = options.pagination.nextCursor
    return metadata
  })

export const respondSuccess = <A>(
  data?: A,
  options?: RespondOptions & {
    readonly statusCode?: number
    readonly links?: Record<string, string | null> | null
  }
): Effect.Effect<SuccessBody<A>> =>
  Effect.map(buildMetadata(options?.statusCode ?? 200, options), (metadata) => {
    const body: SuccessBody<A> = { status: 'success', metadata }
    if (options?.message !== undefined) body.message = options.message
    if (data !== undefined) body.data = data
    if (options?.links !== undefined) body.links = options.links
    return body
  })

// Fails the effect with the envelope rather than returning it: the endpoint's
// declared error schema is what HttpApi encodes a failure's channel into, so
// `yield* respondError(...)` inside a handler propagates as the failure
// HttpApi expects, carrying the status ErrorEnvelope already annotated.
export const respondError = <E extends { readonly message: string }>(
  error: E,
  statusCode: number,
  message: string,
  options?: RespondOptions
): Effect.Effect<never, ErrorBody<E>> =>
  Effect.flatMap(buildMetadata(statusCode, options), (metadata) =>
    Effect.fail<ErrorBody<E>>({ status: 'error', message, error, metadata })
  )
