import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('rate limiting', () => {
  it('is off by default', async () => {
    t = await makeTestApp()
    for (let i = 0; i < 5; i += 1) expect((await t.request('/api/users')).status).toBe(200)
  })

  it('counts down in the envelope and headers, then answers 429 with retry-after', async () => {
    t = await makeTestApp({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW: '1 minute' })

    const first = await t.request('/api/users')
    const firstBody: any = await first.json()
    expect(firstBody.metadata.rate_limit).toMatchObject({ limit: 2, remaining: 1 })
    expect(first.headers.get('x-ratelimit-remaining')).toBe('1')

    expect((await t.request('/api/users')).status).toBe(200)

    const limited = await t.request('/api/users')
    const body: any = await limited.json()
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.headers.get('x-ratelimit-remaining')).toBe('0')
    expect(body).toMatchObject({ status: 'error', message: 'Too many requests' })
  })

  it('does not limit probes or the root', async () => {
    t = await makeTestApp({ RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 4; i += 1) {
      expect((await t.request('/health')).status).toBe(200)
      expect((await t.request('/')).status).toBe(200)
    }
  })

  it('keys clients by CF-Connecting-IP only when the proxy is trusted', async () => {
    t = await makeTestApp({ RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' })
    const as = (ip: string) => t!.request('/api/users', { headers: { 'cf-connecting-ip': ip } })
    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(200)
    expect((await as('203.0.113.1')).status).toBe(429)
  })
})
