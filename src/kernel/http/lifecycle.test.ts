import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('reports drained only after every request has left', async () => {
    const inFlight = makeInFlight()
    inFlight.enter()
    inFlight.enter()
    expect(await Effect.runPromise(inFlight.count)).toBe(2)

    let drained = false
    const waiting = Effect.runPromise(inFlight.drained).then(() => {
      drained = true
    })

    inFlight.leave()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(drained).toBe(false)

    inFlight.leave()
    await waiting
    expect(drained).toBe(true)
  })
})
