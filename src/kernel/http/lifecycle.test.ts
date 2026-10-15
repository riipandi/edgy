import { afterEach, describe, expect, it } from '@effect/vitest'
import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { makeInFlight } from './inflight.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('readiness during shutdown', () => {
  it('turns /health into 503 once draining begins, and leaves the API alone', async () => {
    t = await makeTestApp()
    expect((await t.request('/health')).status).toBe(200)

    t.http.beginDrain()

    const health = await t.request('/health')
    expect(health.status).toBe(503)
    // Outside `/api` an error is an HTML page; a probe reads the status, not the body.
    expect(health.headers.get('content-type')).toContain('text/html')
    expect(await health.text()).toContain('Shutting down')
    expect((await t.request('/api/users')).status).toBe(200)
  })
})

describe('in-flight tracking', () => {
  // `it.effect` runs on the TestClock: poll intervals are stepped, not waited for.
  it.effect('reports drained only after every request has left', () =>
    Effect.gen(function* () {
      const inFlight = makeInFlight()
      inFlight.enter()
      inFlight.enter()
      expect(yield* inFlight.count).toBe(2)

      const waiting = yield* Effect.forkChild(inFlight.drained)

      // Plenty of polls pass while one request is still in flight.
      yield* TestClock.adjust('1 second')
      inFlight.leave()
      yield* TestClock.adjust('1 second')
      expect(waiting.pollUnsafe()).toBeUndefined()

      inFlight.leave()
      yield* TestClock.adjust('25 millis')
      yield* Fiber.join(waiting)
      expect(yield* inFlight.count).toBe(0)
    })
  )
})
