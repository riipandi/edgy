import { afterEach, describe, expect, it } from '@effect/vitest'
import { Duration } from 'effect'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { makeMemoryRateCheck } from './rate_limit.ts'

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

  it('counts a client by the address the proxy reports, from a trusted proxy only', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '1',
      TRUST_PROXY: '10.0.0.0/8'
    })
    const as = (client: string, peer = '10.0.0.5') =>
      t!.request('/api/users', { ip: peer, headers: { 'x-forwarded-for': client } })

    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(200) // another client behind the same proxy
    expect((await as('203.0.113.1')).status).toBe(429)
  })

  it('ignores X-Forwarded-For from anyone who is not a trusted proxy', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '1',
      TRUST_PROXY: '10.0.0.0/8'
    })
    const as = (spoof: string) =>
      t!.request('/api/users', { ip: '198.51.100.9', headers: { 'x-forwarded-for': spoof } })

    expect((await as('1.1.1.1')).status).toBe(200)
    expect((await as('2.2.2.2')).status).toBe(429) // same peer, whatever it claims
  })

  it('does not let a spoofed first entry buy a fresh bucket behind a trusted proxy', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '1',
      TRUST_PROXY: '10.0.0.5'
    })
    // the proxy appended the real client; the attacker prepended a new value each time
    const as = (spoof: string) =>
      t!.request('/api/users', {
        ip: '10.0.0.5',
        headers: { 'x-forwarded-for': `${spoof}, 198.51.100.7` }
      })
    expect((await as('1.1.1.1')).status).toBe(200)
    expect((await as('2.2.2.2')).status).toBe(429)
    expect((await as('3.3.3.3')).status).toBe(429)
  })

  it('reads the platform header directly, wherever the request seems to come from', async () => {
    t = await makeTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX: '1',
      TRUSTED_PLATFORM: 'CF-Connecting-IP'
    })
    const as = (client: string) =>
      t!.request('/api/users', { headers: { 'cf-connecting-ip': client } })

    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(200)
    expect((await as('203.0.113.1')).status).toBe(429)
  })

  it('ignores the platform header when none is configured: the client writes it', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1' })
    const as = (ip: string) => t!.request('/api/users', { headers: { 'cf-connecting-ip': ip } })
    expect((await as('203.0.113.1')).status).toBe(200)
    expect((await as('203.0.113.2')).status).toBe(429)
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
