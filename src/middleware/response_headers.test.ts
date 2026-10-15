import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('response headers', () => {
  it('forbids caching on every /api response, errors included', async () => {
    t = await makeTestApp()
    expect((await t.request('/api/users')).headers.get('cache-control')).toBe('no-store')
    expect((await t.request('/api/users/not-a-number')).headers.get('cache-control')).toBe(
      'no-store'
    )
  })

  it('does not stop a public resource from being cached', async () => {
    t = await makeTestApp()
    const response = await t.request('/.well-known/security.txt')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
  })

  it('reports the time the server spent, on success and on error', async () => {
    t = await makeTestApp()
    for (const path of ['/api/users', '/nope']) {
      expect((await t.request(path)).headers.get('server-timing') ?? 'missing').toMatch(
        /^total;dur=\d+(\.\d+)?$/
      )
    }
  })

  it('repeats the pagination links in a Link header', async () => {
    t = await makeTestApp()
    const response = await t.request('/api/users?limit=1&page=1')
    const body: any = await response.json()
    const link = response.headers.get('link') ?? ''
    expect(link).toContain(`<${body.links.self}>; rel="self"`)
    expect(link).toContain(`<${body.links.next ?? body.links.self}>; rel=`)
    expect(link).not.toContain('null')
  })

  it('lets a browser read the ids, rate limit and links across origins', async () => {
    t = await makeTestApp()
    const response = await t.request('/api/users', { headers: { origin: 'https://app.example' } })
    const exposed = (response.headers.get('access-control-expose-headers') ?? '').split(/,\s*/)
    for (const name of [
      'x-request-id',
      'x-trace-id',
      'x-cache',
      'x-ratelimit-remaining',
      'retry-after',
      'link'
    ]) {
      expect(exposed).toContain(name)
    }
  })

  it('carries the rate limit in headers and body of a success and of a refusal', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '1' })
    const ok = await t.request('/api/users')
    expect(ok.headers.get('x-ratelimit-limit')).toBe('1')
    expect((await ok.json()).metadata.rate_limit.remaining).toBe(0)

    const refused = await t.request('/api/users')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('x-ratelimit-reset')).not.toBeNull()
    expect((await refused.json()).metadata.rate_limit.limit).toBe(1)
  })
})
