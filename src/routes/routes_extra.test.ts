import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp | undefined
afterEach(async () => {
  await t?.dispose()
  t = undefined
})

describe('HEAD', () => {
  it('answers from the GET route, with no body', async () => {
    t = await makeTestApp()
    for (const path of ['/health', '/', '/users', '/api/users']) {
      const res = await t.request(path, { method: 'HEAD' })
      expect([path, res.status]).toEqual([path, 200])
      expect(await res.text()).toBe('')
    }
  })

  it('is 404 where GET is', async () => {
    t = await makeTestApp()
    expect((await t.request('/nope', { method: 'HEAD' })).status).toBe(404)
  })
})

describe('rate limit on pages', () => {
  it('counts pages and API together, and leaves probes alone', async () => {
    t = await makeTestApp({ RATE_LIMIT_MAX: '3' })
    const statuses: number[] = []
    for (const path of ['/', '/users', '/api/users', '/users']) {
      statuses.push((await t.request(path, { ip: '203.0.113.9' })).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])

    const limited = await t.request('/users', { ip: '203.0.113.9' })
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect(limited.headers.get('content-type')).toContain('text/html')

    expect((await t.request('/health', { ip: '203.0.113.9' })).status).toBe(200)
    expect((await t.request('/.well-known/security.txt', { ip: '203.0.113.9' })).status).toBe(200)
    expect((await t.request('/nope', { ip: '203.0.113.9' })).status).toBe(404)
  })

  it('is off with RATE_LIMIT_ENABLED=false', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 3; i += 1) expect((await t.request('/users')).status).toBe(200)
  })
})

describe('a method the path does not answer', () => {
  it('is 405 with Allow in the API envelope under /api', async () => {
    t = await makeTestApp()
    const res = await t.request('/api/users', { method: 'DELETE' })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD, POST')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } })
  })

  it('is a 405 page with Allow outside /api', async () => {
    t = await makeTestApp()
    const res = await t.request('/users', { method: 'POST' })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it.each([
    ['POST', '/', 'GET, HEAD'],
    ['PUT', '/health', 'GET, HEAD'],
    ['DELETE', '/users', 'GET, HEAD']
  ])('%s %s lists what the path answers', async (method, path, allow) => {
    t = await makeTestApp()
    const res = await t.request(path, { method })
    expect([res.status, res.headers.get('allow')]).toEqual([405, allow])
  })

  it('stays 404 for a path no method answers, under /api and outside it', async () => {
    t = await makeTestApp()
    for (const [method, path] of [
      ['DELETE', '/nowhere'],
      ['POST', '/api/nowhere'],
      ['PUT', '/assets/missing.js']
    ] as const) {
      const res = await t.request(path, { method })
      expect([path, res.status, res.headers.get('allow')]).toEqual([path, 404, null])
    }
  })
})
