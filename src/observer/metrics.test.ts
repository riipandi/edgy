import { it } from '@effect/vitest'
import { Effect, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { httpRequestDuration, httpRequests, methodLabel, recordRequest } from './metrics.ts'

it.effect('maps unknown methods to OTHER to keep the series bounded', () =>
  Effect.gen(function* () {
    yield* recordRequest('BREW', '2xx', 1)
    yield* recordRequest('get', '2xx', 1)

    const other = yield* Metric.value(
      Metric.withAttributes(httpRequests, { method: 'OTHER', status: '2xx' })
    )
    expect(other.count).toBe(2)
    expect(methodLabel('GET')).toBe('GET')
  })
)

it.effect('accumulates bounded request series', () =>
  Effect.gen(function* () {
    yield* recordRequest('GET', '2xx', 12)
    yield* recordRequest('GET', '2xx', 30)
    yield* recordRequest('POST', '4xx', 5)

    const get2xx = yield* Metric.value(
      Metric.withAttributes(httpRequests, { method: 'GET', status: '2xx' })
    )
    const post4xx = yield* Metric.value(
      Metric.withAttributes(httpRequests, { method: 'POST', status: '4xx' })
    )
    expect(get2xx.count).toBe(2)
    expect(post4xx.count).toBe(1)

    const getDuration = yield* Metric.value(
      Metric.withAttributes(httpRequestDuration, { method: 'GET' })
    )
    expect(getDuration.count).toBe(2)
    expect(getDuration.sum).toBeCloseTo(0.042, 6)
  })
)
