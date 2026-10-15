import { afterEach, describe, expect, it, vi } from '@effect/vitest'
import { fakeD1 } from '../tests/d1.ts'
import worker from './worker.ts'

const context = { waitUntil: () => {} }
const quiet = { LOG_LEVEL: 'None', OTEL_SDK_DISABLED: 'true', RATE_LIMIT_ENABLED: 'false' }

afterEach(() => vi.restoreAllMocks())

describe('Worker entry', () => {
  it('serves the app over the D1 binding, migrating at start', async () => {
    const env = { ...quiet, DATABASE_AUTO_MIGRATE: 'true', DB: fakeD1() }

    const health = await worker.fetch(new Request('http://w/health'), env, context)
    expect(health.status).toBe(200)

    const created = await worker.fetch(
      new Request('http://w/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'Ada@Example.com', name: 'Ada' })
      }),
      env,
      context
    )
    expect(created.status).toBe(201)

    const page = await worker.fetch(new Request('http://w/users'), env, context)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('ada@example.com')
  })

  it('answers a failed start with a 503 that names the request and hides the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = { ...quiet, D1_BINDING: 'MISSING_DB_SECRET_NAME' }

    const api = await worker.fetch(new Request('http://w/api/users'), env, context)
    expect(api.status).toBe(503)
    expect(api.headers.get('retry-after')).not.toBeNull()
    const requestId = api.headers.get('x-request-id')
    expect(requestId).toMatch(/^req_/)
    expect(await api.json()).toMatchObject({
      status: 'error',
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
      metadata: { status_code: 503, request_id: requestId }
    })

    const page = await worker.fetch(new Request('http://w/users'), env, context)
    expect(page.status).toBe(503)
    expect(page.headers.get('content-type')).toContain('text/plain')
    expect(await page.text()).not.toContain('MISSING_DB_SECRET_NAME')

    // The cause is in the Worker's log, under the id the client holds.
    expect(log).toHaveBeenCalledTimes(2)
    expect(String(log.mock.calls[0]?.[0])).toContain(requestId)
    expect(String(log.mock.calls[0]?.[0])).toContain('MISSING_DB_SECRET_NAME')
  })
})
