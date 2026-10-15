import { afterEach, describe, expect, it } from '@effect/vitest'
import { Duration } from 'effect'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { forwardedClient, makeMemoryRateCheck } from './rate_limit.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('rate limiting', () => {
  it('is on by default, with an allowance of 100 per window', async () => {
    t = await makeTestApp()
    const response = await t.request('/api/users')
    expect(response.headers.get('x-ratelimit-limit')).toBe('100')
    expect(response.headers.get('x-ratelimit-remaining')).toBe('99')
  })

  it('is off when RATE_LIMIT_ENABLED is false, whatever the other settings say', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 3; i += 1) {
      const response = await t.request('/api/users')
      expect(response.status).toBe(200)
      expect(response.headers.get('x-ratelimit-limit')).toBeNull()
    }
  })

  it('reports the limit and reset, without a remaining count, when the store cannot say', async () => {
    let calls = 0
    t = await makeTestApp(
      { RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_STORE: 'cloudflare' },
      {
        rateCheck: () => ({
          allowed: (calls += 1) <= 1,
          limit: 100,
          resetAt: Date.now() + 30_000
        })
      }
    )

    const first = await t.request('/api/users')
    expect(first.status).toBe(200)
    expect(first.headers.get('x-ratelimit-limit')).toBe('100')
    expect(first.headers.get('x-ratelimit-reset')).not.toBeNull()
    expect(first.headers.get('x-ratelimit-remaining')).toBeNull()
    const body: any = await first.json()
    expect(body.metadata.rate_limit.limit).toBe(100)
    expect(body.metadata.rate_limit).not.toHaveProperty('remaining')

    const limited = await t.request('/api/users')
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.headers.get('x-ratelimit-limit')).toBe('100')
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
    // the refusal reports the same allowance as a success does
    expect(body.metadata.rate_limit).toMatchObject({ limit: 2, remaining: 0 })
  })

  it('does not limit probes or the root', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 4; i += 1) {
      expect((await t.request('/health')).status).toBe(200)
      expect((await t.request('/')).status).toBe(200)
    }
  })

  it('ignores CF-Connecting-IP off Workers: there it is the client who writes it', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' })
    const as = (ip: string) => t!.request('/api/users', { headers: { 'cf-connecting-ip': ip } })
    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(429) // same socket, so the same client
  })

  it('keys clients by CF-Connecting-IP on Workers, where the platform sets it', async () => {
    t = await makeTestApp(
      { RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' },
      { platform: 'workers' }
    )
    const as = (ip: string) => t!.request('/api/users', { headers: { 'cf-connecting-ip': ip } })
    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(200)
    expect((await as('203.0.113.1')).status).toBe(429)
  })

  it('counts X-Forwarded-For from the right, so a spoofed first entry buys nothing', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '1',
      TRUST_PROXY: 'true',
      TRUST_PROXY_HOPS: '1'
    })
    // the proxy appends the real client (198.51.100.7); the attacker prepends a new value each time
    const as = (spoof: string) =>
      t!.request('/api/users', { headers: { 'x-forwarded-for': `${spoof}, 198.51.100.7` } })
    expect((await as('1.1.1.1')).status).toBe(200)
    expect((await as('2.2.2.2')).status).toBe(429)
    expect((await as('3.3.3.3')).status).toBe(429)
  })
})

describe('forwardedClient', () => {
  it('picks the entry the given number of proxies from the right', () => {
    expect(forwardedClient('a, b, c', 1)).toBe('c')
    expect(forwardedClient('a, b, c', 2)).toBe('b')
    expect(forwardedClient('203.0.113.9', 1)).toBe('203.0.113.9')
  })

  it('has nothing to say when the header is missing, short or blank', () => {
    expect(forwardedClient(null, 1)).toBeUndefined()
    expect(forwardedClient('a', 2)).toBeUndefined()
    expect(forwardedClient('a, ', 1)).toBeUndefined()
  })
})

describe('memory rate check', () => {
  const window = Duration.minutes(1)

  it('stays bounded, evicting the oldest client when full', async () => {
    const check = makeMemoryRateCheck({ max: 2, window, maxTracked: 3 })
    for (const client of ['a', 'b', 'c', 'd']) await check(client) // "d" evicts "a", the oldest

    // "a" was forgotten, so it starts a fresh count; "c" is still counted
    expect((await check('a')).remaining).toBe(1)
    expect((await check('c')).remaining).toBe(0)
  })

  it('does not scan the map once per request when full', async () => {
    const check = makeMemoryRateCheck({ max: 1, window, maxTracked: 20_000 })
    for (let i = 0; i < 20_000; i += 1) await check(`ip-${i}`)

    const started = performance.now()
    for (let i = 0; i < 2_000; i += 1) await check(`flood-${i}`)
    // each call was a full pass over 20k buckets before: seconds, not milliseconds
    expect(performance.now() - started).toBeLessThan(250)
  })
})
