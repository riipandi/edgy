import { afterAll, describe, expect, it } from 'vite-plus/test'
import { toHandler } from '../../fixtures/api.ts'
import { limitedConfig } from '../../fixtures/config.ts'
import { migratedDatabaseFor } from '../../fixtures/database.ts'
import { testServices } from '../../fixtures/users.ts'

// A database of its own: the limiter's counters live in the shared fixtures
// database, and requests from the other route suites would exhaust the window
// before this file runs.
const { handler: limitedHandler, dispose } = toHandler(
  testServices,
  limitedConfig,
  migratedDatabaseFor('rate-limit.db')
)

afterAll(() => dispose())

describe('rate limiting', () => {
  const headers = { 'x-forwarded-for': '203.0.113.7' }

  it('counts requests and exposes RateLimit headers while under the max', async () => {
    const first = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(first.status).toBe(200)
    expect(first.headers.get('ratelimit-limit')).toBe('2')
    expect(first.headers.get('ratelimit-remaining')).toBe('1')

    const second = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(second.status).toBe(200)
    expect(second.headers.get('ratelimit-remaining')).toBe('0')
  })

  it('responds 429 once the max is exceeded', async () => {
    const response = await limitedHandler(new Request('http://localhost/api/health', { headers }))
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('Too Many Requests')
    expect(response.headers.get('ratelimit-remaining')).toBe('0')
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
  })
})
