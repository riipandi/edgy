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
