import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

/** Occupies `count` slots as if that many slow requests were being handled. */
const occupy = (app: TestApp, count: number): (() => void) => {
  for (let i = 0; i < count; i += 1) app.http.inFlight.enter()
  return () => {
    for (let i = 0; i < count; i += 1) app.http.inFlight.leave()
  }
}

describe('overload guard', () => {
  it('refuses a request past MAX_IN_FLIGHT with 503 and retry-after, in the envelope', async () => {
    t = await makeTestApp({ MAX_IN_FLIGHT: '2' })
    const release = occupy(t, 2) // the next request is the third at once

    const response = await t.request('/api/users')
    const body: any = await response.json()
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')
    expect(body).toMatchObject({ status: 'error', message: 'Server is overloaded, retry shortly' })
    expect(body.metadata.request_id).toBe(response.headers.get('x-request-id'))

    release()
    expect((await t.request('/api/users')).status).toBe(200)
  })

  it('serves the request that exactly fills the limit', async () => {
    t = await makeTestApp({ MAX_IN_FLIGHT: '2' })
    const release = occupy(t, 1) // this request is the second
    expect((await t.request('/api/users')).status).toBe(200)
    release()
  })

  it('never refuses the readiness probe or the metrics scrape', async () => {
    t = await makeTestApp({ MAX_IN_FLIGHT: '1', METRICS_ENABLED: 'true' })
    const release = occupy(t, 5)

    expect((await t.request('/health')).status).toBe(200)
    expect((await t.request('/metrics')).status).toBe(200)
    expect((await t.request('/api/users')).status).toBe(503)
    release()
  })

  it('counts what it refused', async () => {
    t = await makeTestApp({ MAX_IN_FLIGHT: '1', METRICS_ENABLED: 'true' })
    // The metric registry is process-wide, so compare against what it held before.
    const shed = async () =>
      Number(
        /^http_requests_shed_total (\d+)/m.exec(await (await t!.request('/metrics')).text())?.[1] ??
          0
      )
    const before = await shed()

    const release = occupy(t, 3)
    await t.request('/api/users')
    await t.request('/api/users')
    release()

    expect(await shed()).toBe(before + 2)
  })

  it('is off when MAX_IN_FLIGHT is 0', async () => {
    t = await makeTestApp({ MAX_IN_FLIGHT: '0' })
    const release = occupy(t, 5000)
    expect((await t.request('/api/users')).status).toBe(200)
    release()
  })
})
