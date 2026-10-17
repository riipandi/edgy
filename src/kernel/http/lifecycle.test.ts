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
    // Outside `/api` an error is an HTML page (its body is the renderer-less placeholder until
    // phase 2 of plan-20261018_0105); a probe reads the status, not the body.
    expect(health.headers.get('content-type')).toContain('text/html')
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

describe('in-flight tracking of streamed bodies', () => {
  const stream = (chunks: number) => {
    let sent = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === chunks) return controller.close()
        controller.enqueue(new TextEncoder().encode(`chunk${sent++};`))
      }
    })
  }

  it('keeps a request in flight until its body has been read', async () => {
    t = await makeTestApp()
    t.app.get('/stream', () => new Response(stream(3), { headers: { 'x-kept': 'yes' } }))

    const response = await t.request('/stream')
    expect(response.headers.get('x-kept')).toBe('yes')
    expect(t.http.inFlight.active()).toBe(1)
    expect(await response.text()).toBe('chunk0;chunk1;chunk2;')
    expect(t.http.inFlight.active()).toBe(0)
  })

  it('lets go when the client cancels the body', async () => {
    t = await makeTestApp()
    t.app.get('/stream', () => new Response(stream(1000)))

    const response = await t.request('/stream')
    expect(t.http.inFlight.active()).toBe(1)
    await response.body?.cancel()
    expect(t.http.inFlight.active()).toBe(0)
  })

  it('lets go when the stream fails, and for a body-less or failed answer', async () => {
    t = await makeTestApp()
    t.app.get('/broken', () => {
      const failing = new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('source failed')
        }
      })
      return new Response(failing)
    })

    const broken = await t.request('/broken')
    await expect(broken.text()).rejects.toThrow('source failed')
    expect(t.http.inFlight.active()).toBe(0)

    // Every body is a stream, so a request is out of flight once its body has been read.
    for (const [path, status] of [
      ['/health', 200],
      ['/nope', 404]
    ] as const) {
      const response = await t.request(path)
      expect(response.status).toBe(status)
      await response.text()
    }
    expect(t.http.inFlight.active()).toBe(0)
  })
})
