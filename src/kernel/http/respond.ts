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

// trace_id has no source until a span is active; absent outside a traced
// request (a unit test, a fixture) rather than failing the response.
const currentTraceId = Effect.currentSpan.pipe(
  Effect.map((span) => Option.some(span.traceId)),
  Effect.catch(() => Effect.succeed(Option.none<string>()))
)

const toApiRateLimit = (verdict: ConsumeVerdict) =>
  Effect.map(Clock.currentTimeMillis, (now) => ({
    limit: verdict.limit,
    remaining: verdict.remaining,
    reset: Math.floor(now / 1000) + verdict.resetSeconds
  }))

// Reads the ambient request-id/rate-limit/span data every success and error
// response shares, so a handler never assembles it by hand.
const buildMetadata = (statusCode: number, options?: RespondOptions) =>
  Effect.gen(function* () {
    const requestId = yield* RequestId
    const traceId = yield* currentTraceId
    const verdict = yield* RateLimitVerdict
    const rateLimit = Option.isSome(verdict) ? yield* toApiRateLimit(verdict.value) : undefined
    return {
      status_code: statusCode,
      request_id: requestId,
      ...(Option.isSome(traceId) ? { trace_id: traceId.value } : {}),
      ...(rateLimit !== undefined ? { rate_limit: rateLimit } : {}),
      ...(options?.cache !== undefined ? { cache: options.cache } : {}),
      ...(options?.pagination?.limit !== undefined ? { limit: options.pagination.limit } : {}),
      ...(options?.pagination?.hasMore !== undefined
        ? { has_more: options.pagination.hasMore }
        : {}),
      ...(options?.pagination?.nextCursor !== undefined
        ? { next_cursor: options.pagination.nextCursor }
        : {})
    }
  })

export const respondSuccess = <A>(
  data?: A,
  options?: RespondOptions & {
    readonly statusCode?: number
    readonly links?: Record<string, string | null> | null
  }
) =>
  Effect.map(buildMetadata(options?.statusCode ?? 200, options), (metadata) => ({
    status: 'success' as const,
    ...(options?.message !== undefined ? { message: options.message } : {}),
    ...(data !== undefined ? { data } : {}),
    metadata,
    ...(options?.links !== undefined ? { links: options.links } : {})
  }))

export const respondError = <E extends { readonly message: string }>(
  error: E,
  statusCode: number,
  options?: RespondOptions
) =>
  Effect.map(buildMetadata(statusCode, options), (metadata) => ({
    status: 'error' as const,
    message: error.message,
    error,
    metadata
  }))
