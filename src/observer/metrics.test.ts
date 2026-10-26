import { it } from '@effect/vitest'
import { Effect, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { httpRequestDuration, httpRequests, methodLabel, recordRequest } from './metrics.ts'

it.effect('maps unknown methods to OTHER to keep the series bounded', () =>
  Effect.gen(function* () {
    yield* recordRequest('BREW', 200, '/api/health', 1)
    yield* recordRequest('get', 200, '/api/health', 1)

    const other = yield* Metric.value(
      Metric.withAttributes(httpRequests, {
        method: 'OTHER',
        status_code: '200',
        route: '/api/health'
      })
    )
    expect(other.count).toBe(2)
    expect(methodLabel('GET')).toBe('GET')
  })
)

it.effect('accumulates bounded request series', () =>
  Effect.gen(function* () {
    yield* recordRequest('GET', 200, '/api/users', 12)
    yield* recordRequest('GET', 200, '/api/users', 30)
    yield* recordRequest('POST', 500, '/api/users', 5)

    const getOk = yield* Metric.value(
      Metric.withAttributes(httpRequests, {
        method: 'GET',
        status_code: '200',
        route: '/api/users'
      })
    )
    const postError = yield* Metric.value(
      Metric.withAttributes(httpRequests, {
        method: 'POST',
        status_code: '500',
        route: '/api/users'
      })
    )
    expect(getOk.count).toBe(2)
    expect(postError.count).toBe(1)

    const getDuration = yield* Metric.value(
      Metric.withAttributes(httpRequestDuration, { method: 'GET', route: '/api/users' })
    )
    expect(getDuration.count).toBe(2)
    expect(getDuration.sum).toBeCloseTo(0.042, 6)
  })
)

it.effect('labels the exact status code, not the class', () =>
  Effect.gen(function* () {
    yield* recordRequest('GET', 429, '/api/users/:id', 3)
    yield* recordRequest('GET', 404, '/api/users/:id', 4)

    const limited = yield* Metric.value(
      Metric.withAttributes(httpRequests, {
        method: 'GET',
        status_code: '429',
        route: '/api/users/:id'
      })
    )
    const missing = yield* Metric.value(
      Metric.withAttributes(httpRequests, {
        method: 'GET',
        status_code: '404',
        route: '/api/users/:id'
      })
    )
    expect(limited.count).toBe(1)
    expect(missing.count).toBe(1)
  })
)
