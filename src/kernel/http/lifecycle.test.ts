import { Effect, Fiber, ManagedRuntime } from 'effect'
import { TestClock } from 'effect/testing'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
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
    expect(await health.json()).toMatchObject({ status: 'error', message: 'Shutting down' })
    expect((await t.request('/api/users')).status).toBe(200)
  })
})

describe('in-flight tracking', () => {
  // Time is the TestClock's, so the poll interval is stepped through instead of waited for.
  const runtime = ManagedRuntime.make(TestClock.layer())
  afterAll(() => runtime.dispose())

  it('reports drained only after every request has left', () =>
    runtime.runPromise(
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
    ))
})
