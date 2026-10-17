import { afterEach, describe, expect, it, vi } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { DatabaseService } from '../database/service.ts'

let t: TestApp | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await t?.dispose()
  t = undefined
})

/** An app whose `users` table is gone, so every request to `/api/users` is a database failure. */
const brokenApp = async (env: Record<string, string>): Promise<TestApp> => {
  const app = await makeTestApp(env)
  await app.run(
    DatabaseService.use(({ query }) => query((db) => db.schema.dropTable('users').execute()))
  )
  return app
}

describe('error responses', () => {
  it('say what failed and whether to retry, without internals, at the default log level', async () => {
    t = await brokenApp({})
    const response = await t.request('/api/users')
    const body: any = await response.json()

    expect(response.status).toBe(500)
    expect(body.message).toBe('Database error')
    expect(body.error).toEqual({ code: 'DATABASE_ERROR', retryable: false })
    expect(JSON.stringify(body)).not.toContain('no such table')
  })

  it('add the redacted cause at LOG_LEVEL=Debug and below', async () => {
    for (const level of ['Debug', 'Trace']) {
      t = await brokenApp({ LOG_LEVEL: level })
      const body: any = await (await t.request('/api/users')).json()
      expect(body.error.debug.type).toBe('DatabaseError')
      expect(body.error.debug.message).toContain('no such table')
      // The failure is logged, to the app's captured log and not to the test run.
      expect(t.logs.join('\n')).toContain('Query failed')
      await t.dispose()
      t = undefined
    }
  })

  it('keep the same code on h3-level errors, and say when to retry a refusal', async () => {
    t = await makeTestApp({ RATE_LIMIT_MAX: '1' })

    const missing: any = await (await t.request('/api/nope')).json()
    expect(missing.error).toEqual({ code: 'NOT_FOUND', retryable: false })

    await t.request('/api/users')
    const limited = await t.request('/api/users')
    const body: any = await limited.json()
    expect(limited.status).toBe(429)
    expect(body.error).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    expect(body.error.details.retry_after).toBe(Number(limited.headers.get('retry-after')))
  })

  it('put the error code in the request log line', async () => {
    t = await makeTestApp({ LOG_LEVEL: 'Info', LOG_FORMAT: 'json' })
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    await t.request('/api/nope')
    await t.dispose()
    t = undefined

    const line = lines.find((entry) => entry.includes('GET /api/nope 404'))
    expect(line).toContain('"errorCode":"NOT_FOUND"')
  })
})

describe('client location in the request log', () => {
  const logged = async (env: Record<string, string>, headers: Record<string, string>) => {
    t = await makeTestApp({ LOG_LEVEL: 'Info', LOG_FORMAT: 'json', ...env })
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    await t.request('/api/users', { headers })
    await t.dispose()
    t = undefined
    return lines.find((entry) => entry.includes('GET /api/users 200')) ?? ''
  }

  const cloudflare = {
    'cf-connecting-ip': '203.0.113.7',
    'cf-ipcountry': 'ID',
    'cf-ipcity': 'Jakarta'
  }

  it('names country and city when asked to and the platform is trusted', async () => {
    const line = await logged(
      { CLOUDFLARE_LOCATION_HEADERS: 'true', TRUSTED_PLATFORM: 'CF-Connecting-IP' },
      cloudflare
    )
    expect(line).toContain('"country":"ID"')
    expect(line).toContain('"city":"Jakarta"')
  })

  it('says nothing by default, or when no platform is trusted', async () => {
    expect(await logged({}, cloudflare)).not.toContain('"country"')
    expect(await logged({ CLOUDFLARE_LOCATION_HEADERS: 'true' }, cloudflare)).not.toContain(
      '"country"'
    )
  })
})

describe('HEAD', () => {
  it('answers from the GET route, with no body', async () => {
    t = await makeTestApp()
    // `/` and `/users` are pages without a renderer yet (503, phase 3 of the plan restores 200).
    for (const [path, status] of [
      ['/health', 200],
      ['/', 503],
      ['/users', 503],
      ['/api/users', 200]
    ] as const) {
      const res = await t.request(path, { method: 'HEAD' })
      expect([path, res.status]).toEqual([path, status])
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
    // Pages answer 503 until the renderer lands (plan-20261018_0105 phase 3); the rate limiter
    // counts them before that answer, so the fourth request is still refused.
    expect(statuses).toEqual([503, 503, 200, 429])

    const limited = await t.request('/users', { ip: '203.0.113.9' })
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect(limited.headers.get('content-type')).toContain('text/html')

    expect((await t.request('/health', { ip: '203.0.113.9' })).status).toBe(200)
    expect((await t.request('/.well-known/security.txt', { ip: '203.0.113.9' })).status).toBe(200)
    expect((await t.request('/nope', { ip: '203.0.113.9' })).status).toBe(404)
  })

  it('is off with RATE_LIMIT_ENABLED=false', async () => {
    t = await makeTestApp({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_MAX: '1' })
    // Pages answer 503 without a renderer yet; the point is they are never 429.
    for (let i = 0; i < 3; i += 1) expect((await t.request('/users')).status).toBe(503)
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
