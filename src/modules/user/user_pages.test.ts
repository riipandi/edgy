import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
  await t.request('/api/users', { method: 'POST', body: { email: 'ada@example.com', name: 'Ada' } })
})
afterAll(() => t.dispose())

/**
 * The Marko pages are gone and the Solid ones arrive in phase 3 of plan-20261018_0105. What the
 * renderer-less window must still prove: a page path answers HTML through the page pipeline (its
 * policy, its headers, its rate limiting) with the placeholder 503, and never leaks the envelope
 * or a renderer error.
 */
describe('GET /users (page, renderer not wired yet)', () => {
  it('answers as an HTML page, not the API envelope', async () => {
    const response = await t.request('/users')
    const html = await response.text()

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).not.toContain('ada@example.com')
  })

  it('answers under the page policy, with no nonce while no inline script exists', async () => {
    const response = await t.request('/users')
    await response.text()
    const policy = response.headers.get('content-security-policy') ?? ''

    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('nonce-')
    expect(policy).not.toContain('unsafe-inline')
  })

  it('keeps the headers every other response carries', async () => {
    const response = await t.request('/users')
    await response.text()

    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('still runs the page program: a bad query is refused before any rendering', async () => {
    const response = await t.request('/users?limit=-1')

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    await response.text()
  })

  describe('the policy under pnpm dev', () => {
    it('lets Vite inject styles and open its socket, and only then', async () => {
      const dev = await makeTestApp({}, { development: true })
      try {
        const developing = await dev.request('/users')
        await developing.text()
        const production = await t.request('/users')
        await production.text()

        const widened = developing.headers.get('content-security-policy') ?? ''
        expect(widened).toContain("style-src 'self' 'unsafe-inline'")
        expect(widened).toContain("connect-src 'self' ws: wss:")
        expect(production.headers.get('content-security-policy')).not.toContain('unsafe-inline')
        expect(production.headers.get('content-security-policy')).not.toContain('ws:')
      } finally {
        await dev.dispose()
      }
    })
  })
})
