import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { MISSING_USER_ID } from '../../tests/ids.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
})
afterAll(() => t.dispose())

const json = async (response: Response): Promise<any> => response.json()

const createUser = (email: string, name?: string) =>
  t.request('/api/users', {
    method: 'POST',
    body: name === undefined ? { email } : { email, name }
  })

describe('root and health', () => {
  it('answers / with plain text, not the envelope', async () => {
    const response = await t.request('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe('All is well')
  })

  it('answers /health with a message and no data', async () => {
    const response = await t.request('/health')
    const body = await json(response)
    expect(response.status).toBe(200)
    expect(body.status).toBe('success')
    expect(body.message).toBeTypeOf('string')
    expect(body).not.toHaveProperty('data')
    expect(body.metadata.status_code).toBe(200)
  })

  it('does not serve /users outside the /api prefix', async () => {
    expect((await t.request('/users')).status).toBe(404)
  })
})

describe('envelope', () => {
  it('wraps a created user and carries the request id in header and body', async () => {
    const response = await createUser('ada@example.com', 'Ada')
    const body = await json(response)
    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      status: 'success',
      data: { email: 'ada@example.com', name: 'Ada' },
      metadata: { status_code: 201 }
    })
    expect(body.metadata.request_id).toBe(response.headers.get('x-request-id'))
  })

  it('echoes an inbound x-request-id', async () => {
    const response = await t.request('/health', { headers: { 'x-request-id': 'req_from_gateway' } })
    expect(response.headers.get('x-request-id')).toBe('req_from_gateway')
    expect((await json(response)).metadata.request_id).toBe('req_from_gateway')
  })

  it('ignores an inbound x-request-id it would not want in a log line', async () => {
    for (const hostile of [
      'a b',
      'a=b',
      'x"y',
      'req_1 level=ERROR forged',
      'é'.repeat(3),
      'a'.repeat(129)
    ]) {
      const response = await t.request('/health', { headers: { 'x-request-id': hostile } })
      expect(response.headers.get('x-request-id')).toMatch(/^req_[0-7][0-9a-hjkmnp-tv-z]{25}$/)
    }
  })

  it('renders typed failures from the error itself', async () => {
    const missing = await t.request(`/api/users/${MISSING_USER_ID}`)
    expect(missing.status).toBe(404)
    expect(await json(missing)).toMatchObject({
      status: 'error',
      message: 'User not found',
      error: { code: 'NOT_FOUND', retryable: false, details: { id: MISSING_USER_ID } },
      metadata: { status_code: 404 }
    })

    await createUser('dup@example.com')
    const duplicate = await createUser('dup@example.com')
    expect(duplicate.status).toBe(409)
    expect(await json(duplicate)).toMatchObject({
      status: 'error',
      message: 'User already exists',
      error: { code: 'CONFLICT', details: { resource: 'User' } }
    })

    const invalid = await createUser('not-an-email')
    const body = await json(invalid)
    expect(invalid.status).toBe(400)
    expect(body.message).toBe('Validation failed')
    expect(body.error).toMatchObject({ code: 'VALIDATION_FAILED', retryable: false })
    expect(body.error.details[0].path).toEqual(['email'])
  })

  it('renders h3-level errors in the same envelope', async () => {
    const response = await t.request('/api/nope')
    expect(response.status).toBe(404)
    expect(await json(response)).toMatchObject({ status: 'error', message: 'Not found' })
  })

  it('rejects a body that is not JSON with 415', async () => {
    const response = await t.app.fetch(
      new Request('http://test/api/users', {
        method: 'POST',
        body: 'email=a@b.co',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
      })
    )
    expect(response.status).toBe(415)
    expect((await json(response)).status).toBe('error')
  })

  it('carries security headers on success and on error', async () => {
    for (const path of ['/health', '/api/nope']) {
      const response = await t.request(path)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    }
  })

  it('serves security.txt as plain text', async () => {
    const response = await t.request('/.well-known/security.txt')
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('Contact:')
  })
})

describe('pagination', () => {
  beforeAll(async () => {
    for (let i = 1; i <= 5; i += 1)
      await createUser(`page${i}@example.com`, i % 2 === 0 ? undefined : `P${i}`)
  })

  it('reports position in metadata and navigation in links', async () => {
    const body = await json(await t.request('/api/users?limit=2&sort_by=email'))
    expect(body.data).toHaveLength(2)
    expect(body.metadata).toMatchObject({
      page: 1,
      limit: 2,
      first_item_index: 1,
      last_item_index: 2
    })
    expect(body.metadata.total_items).toBeGreaterThanOrEqual(5)
    expect(body.links.prev).toBeNull()
    expect(body.links.next).toBe('/api/users?limit=2&sort_by=email&page=2')
  })

  it('returns an empty page, not an error, past the end', async () => {
    const body = await json(await t.request('/api/users?limit=2&page=500'))
    expect(body.data).toEqual([])
    expect(body.metadata.first_item_index).toBeNull()
    expect(body.metadata.total_items).toBeGreaterThan(0)
  })

  it('refuses -1 (every record at once): a caller cannot read the table in one request', async () => {
    for (const query of ['limit=-1', 'page=-1', 'limit=-1&page=2']) {
      const response = await t.request(`/api/users?${query}`)
      expect(response.status).toBe(400)
      expect((await json(response)).error.code).toBe('VALIDATION_FAILED')
    }
  })

  it('sorts by an allow-listed column and rejects the rest', async () => {
    const desc = await json(await t.request('/api/users?sort_by=id&sort_order=desc&limit=3'))
    const ids = desc.data.map((user: { id: string }) => user.id)
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? 1 : -1)))

    expect((await t.request('/api/users?sort_by=password')).status).toBe(400)
    expect((await t.request('/api/users?limit=101')).status).toBe(400)
    expect((await t.request('/api/users?page=0')).status).toBe(400)
  })

  it('does not leak the total column into items', async () => {
    const body = await json(await t.request('/api/users?limit=1'))
    expect(Object.keys(body.data[0]).sort()).toEqual(['email', 'id', 'name'])
  })
})
