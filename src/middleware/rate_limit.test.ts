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

  it('is off when RATE_LIMIT_ENABLED is false, whatever the other settings say', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 3; i += 1) {
      const response = await t.request('/api/users')
      expect(response.status).toBe(200)
      expect(response.headers.get('x-ratelimit-limit')).toBeNull()
    }
  })

  it('refuses with retry-after and no allowance headers when the store reports none', async () => {
    let calls = 0
    t = await makeTestApp(
      { RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_STORE: 'cloudflare' },
      { rateCheck: () => ({ allowed: (calls += 1) <= 1, resetAt: Date.now() + 30_000 }) }
    )

    const first = await t.request('/api/users')
    expect(first.status).toBe(200)
    expect(first.headers.get('x-ratelimit-limit')).toBeNull()
    const body: any = await first.json()
    expect(body.metadata.rate_limit).toBeUndefined()

    const limited = await t.request('/api/users')
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.headers.get('x-ratelimit-remaining')).toBeNull()
  })

  it('counts down in the envelope and headers, then answers 429 with retry-after', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '2',
      RATE_LIMIT_WINDOW: '60000'
    })

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
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 4; i += 1) {
      expect((await t.request('/health')).status).toBe(200)
      expect((await t.request('/')).status).toBe(200)
    }
  })

  it('keys clients by CF-Connecting-IP only when the proxy is trusted', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' })
    const as = (ip: string) => t!.request('/api/users', { headers: { 'cf-connecting-ip': ip } })
    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(200)
    expect((await as('203.0.113.1')).status).toBe(429)
  })
})
