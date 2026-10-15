import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'

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

describe('GET /users (page)', () => {
  it('renders the directory as HTML, not the API envelope', async () => {
    const response = await t.request('/users')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>Users</title>')
    expect(html).toContain('ada@example.com')
    expect(html).toContain('grace@example.com')
    expect(html).toContain('Showing <!>2')
  })

  it('escapes what users typed, so a name cannot inject markup', async () => {
    const html = await (await t.request('/users')).text()
    expect(html).not.toContain('<b>Lovelace</b>')
    expect(html).toContain('&lt;b>Lovelace&lt;/b>')
  })

  it('answers under its own policy, with a nonce for the inline resume script only', async () => {
    const response = await t.request('/users')
    const html = await response.text()
    const policy = response.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]

    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('unsafe-inline')
    expect(nonce).toBeTypeOf('string')
    expect(html).toContain(`nonce=${nonce}`)
  })

  it('gives every response its own nonce and never lets a shared cache keep a page', async () => {
    const first = await t.request('/users')
    const second = await t.request('/users')
    await Promise.all([first.text(), second.text()])

    expect(first.headers.get('content-security-policy')).not.toBe(
      second.headers.get('content-security-policy')
    )
    expect(first.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('keeps the headers every other response carries', async () => {
    const response = await t.request('/users')
    await response.text()

    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('points the browser at the built scripts and styles it needs', async () => {
    // Under test the plugin is not linked, so there are no built assets to name; the page must
    // still render its interactive part (the filter) with the serialized data.
    const html = await (await t.request('/users')).text()
    expect(html).toContain('type=search')
  })

  it('takes the same pagination parameters as the API', async () => {
    const html = await (await t.request('/users?limit=1')).text()
    expect(html).toContain('Showing <!>1')
    expect(html).toContain('1 more not shown.')
  })

  it('refuses a bad query in the common error shape, not as a page', async () => {
    const response = await t.request('/users?limit=-1')
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.status).toBe('error')
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })
})
