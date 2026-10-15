import { afterEach, describe, expect, it } from 'vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('/metrics', () => {
  it('does not exist unless enabled', async () => {
    t = await makeTestApp()
    expect((await t.request('/metrics')).status).toBe(404)
  })

  it('serves Prometheus text including the request counter', async () => {
    t = await makeTestApp({ METRICS_ENABLED: 'true' })
    await t.request('/health')

    const response = await t.request('/metrics')
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(text).toContain('http_requests_total')
  })
})
