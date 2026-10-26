import { it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vite-plus/test'
import type { ConsumeVerdict } from '#/middleware/rate-limit.ts'
import { RateLimitVerdict, RequestId } from './request-context.ts'
import { respondError, respondSuccess } from './respond.ts'

it.effect('respondSuccess falls back to the RequestId reference default outside any request', () =>
  Effect.gen(function* () {
    const body = yield* respondSuccess({ id: 1 })
    expect(body).toEqual({
      status: 'success',
      data: { id: 1 },
      metadata: { status_code: 200, request_id: '' }
    })
  })
)

it.effect('respondSuccess reads the request id and cache status provided by the middleware', () =>
  Effect.gen(function* () {
    const body = yield* respondSuccess(
      { id: 1 },
      { statusCode: 201, message: 'created', cache: 'hit', links: { self: '/api/users/1' } }
    ).pipe(Effect.provideService(RequestId, 'req_test123'))
    expect(body).toEqual({
      status: 'success',
      message: 'created',
      data: { id: 1 },
      metadata: { status_code: 201, request_id: 'req_test123', cache: 'hit' },
      links: { self: '/api/users/1' }
    })
  })
)

it.effect('respondSuccess folds a rate-limit verdict into an absolute reset timestamp', () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(0)
    const verdict: ConsumeVerdict = { allowed: true, limit: 10, remaining: 9, resetSeconds: 42 }
    const body = yield* respondSuccess(undefined, { pagination: { hasMore: false } }).pipe(
      Effect.provideService(RateLimitVerdict, Option.some(verdict))
    )
    expect(body.metadata).toEqual({
      status_code: 200,
      request_id: '',
      rate_limit: { limit: 10, remaining: 9, reset: 42 },
      has_more: false
    })
    expect(body).not.toHaveProperty('data')
  })
)

it.effect('respondError fails with the envelope carrying the error instance and status code', () =>
  Effect.gen(function* () {
    const error = { message: 'unused', code: 'USER_NOT_FOUND', retryable: false }
    const body = yield* Effect.flip(
      respondError(error, 404, 'User not found').pipe(
        Effect.provideService(RequestId, 'req_test123')
      )
    )
    expect(body).toEqual({
      status: 'error',
      message: 'User not found',
      error,
      metadata: { status_code: 404, request_id: 'req_test123' }
    })
  })
)
