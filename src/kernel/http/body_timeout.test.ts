import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

/** A POST whose body is promised and then never finishes: what a stalled client looks like. */
const stalledPost = (app: TestApp) =>
  app.app.fetch(
    new Request('http://test/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"email":'))
        }
      }),
      duplex: 'half'
    } as RequestInit)
  )

describe('a request body that never finishes', () => {
  it('is answered 408 after REQUEST_TIMEOUT and gives its in-flight slot back', async () => {
    t = await makeTestApp({ REQUEST_TIMEOUT: '150' })

    const started = performance.now()
    const response = await stalledPost(t)
    const body = await response.json()

    expect(response.status).toBe(408)
    expect(body.error.code).toBe('REQUEST_TIMEOUT')
    expect(body.error.retryable).toBe(true)
    expect(performance.now() - started).toBeLessThan(1_500)
    expect(await t.http.inFlight.count.pipe((count) => t!.run(count))).toBe(0)
  })

  it('cannot starve the server: stalled clients do not make it refuse the next request', async () => {
    t = await makeTestApp({ REQUEST_TIMEOUT: '150', MAX_IN_FLIGHT: '2' })

    const stalled = await Promise.all([stalledPost(t), stalledPost(t)])
    expect(stalled.map((response) => response.status)).toEqual([408, 408])
    expect((await t.request('/api/users')).status).toBe(200)
  })
})
