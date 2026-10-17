import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { DatabaseService } from '../../database/service.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp({ RATE_LIMIT_MAX: '1' })
})
afterAll(() => t.dispose())

describe('errors outside /api are pages', () => {
  it('answers an unknown path with a 404 page that carries the request id', async () => {
    const response = await t.request('/nope')
    const html = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>404 Not found</title>')
    expect(html).toContain(response.headers.get('x-request-id') ?? 'no request id')
  })

  it('keeps the shared headers and gives the page its own policy', async () => {
    const response = await t.request('/nope')
    await response.text()
    const policy = response.headers.get('content-security-policy') ?? ''

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    expect(policy).toContain("script-src 'self'")
    expect(policy).not.toContain('nonce-')
    expect(policy).not.toContain('unsafe-inline')
  })

  it('does not say what an unhandled failure was', async () => {
    const broken = await makeTestApp()
    try {
      await broken.run(
        DatabaseService.use(({ query }) => query((db) => db.schema.dropTable('users').execute()))
      )
      const response = await broken.request('/users')
      const html = await response.text()

      expect(response.status).toBe(500)
      expect(html).toContain('Database error')
      expect(html).not.toContain('no such table')
    } finally {
      await broken.dispose()
    }
  })

  it('escapes what a path says, so an error page cannot inject markup', async () => {
    const html = await (await t.request('/<script>alert(1)</script>')).text()
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

describe('errors under /api stay JSON', () => {
  it('answers an unknown API path with the error envelope', async () => {
    const response = await t.request('/api/nope')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } })
  })

  it('treats /api as the API and /apiary as a page', async () => {
    const api = await t.request('/api')
    expect(api.headers.get('content-type')).toContain('application/json')
    await api.text()

    const page = await t.request('/apiary')
    expect(page.headers.get('content-type')).toContain('text/html')
    await page.text()
  })
})
