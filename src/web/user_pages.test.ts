import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
  for (const [email, name] of [
    ['ada@example.com', 'Ada <b>Lovelace</b>'],
    ['grace@example.com', 'Grace Hopper']
  ] as const) {
    await t.request('/api/users', { method: 'POST', body: { email, name } })
  }
})
afterAll(() => t.dispose())

/**
 * The pages render through the file-based router (`src/pages/`), whose `/users` route draws the
 * directory from `/rpc` — phase 4 of plan-20261018_0105, not wired yet, so the route draws an
 * empty list. What the server render must still prove: the shell, the router's markup, the page
 * policy, the shared headers, and the envelope staying under `/api`.
 */
describe('GET /users (page)', () => {
  it('renders the directory shell as HTML, not the API envelope', async () => {
    const response = await t.request('/users')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>Users</title>')
    expect(html).toContain('id="users-page-root"')
    expect(html).not.toContain('ada@example.com')
  })

  it('carries the page policy, with no nonce while no inline script exists', async () => {
    const response = await t.request('/users')
    await response.text()
    const policy = response.headers.get('content-security-policy') ?? ''

    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('nonce-')
    expect(policy).not.toContain('unsafe-inline')
  })

  it('never lets a shared cache keep a page', async () => {
    const response = await t.request('/users')
    await response.text()

    expect(response.headers.get('cache-control')).toBe('private, no-cache')
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
    const html = await response.text()

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>400 Validation failed</title>')
    expect(html).toContain(response.headers.get('x-request-id') ?? 'no request id')
    expect(html).not.toContain('ada@example.com')
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
