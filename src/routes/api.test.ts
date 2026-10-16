import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { MISSING_USER_ID } from '../../tests/ids.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
})
afterAll(() => t.dispose())

const json = async (response: Response): Promise<any> => response.json()

const createUser = (email: string, name = 'Test User') =>
  t.request('/api/users', {
    method: 'POST',
    body: { email, name }
  })

describe('root and health', () => {
  it('answers / with the front page, not the envelope', async () => {
    const response = await t.request('/')
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<title>edgy</title>')
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

  it('keeps the JSON API under /api: the page at /users is HTML', async () => {
    const response = await t.request('/users')
    expect(response.headers.get('content-type')).toContain('text/html')
    await response.text()
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

  it('treats two spellings of one email as one user, and stores it lowercase', async () => {
    const first = await createUser('Mixed.Case@Example.com')
    expect(first.status).toBe(201)
    expect((await json(first)).data.email).toBe('mixed.case@example.com')

    expect((await createUser('MIXED.case@example.COM')).status).toBe(409)
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

  it('requires a name that says something', async () => {
    for (const body of [
      { email: 'noname@example.com' },
      { email: 'blank@example.com', name: '   ' }
    ]) {
      const response = await t.request('/api/users', { method: 'POST', body })
      const answer = await json(response)
      expect(response.status).toBe(400)
      expect(answer.error.code).toBe('VALIDATION_FAILED')
      expect(answer.error.details[0].path).toEqual(['name'])
    }
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
  const ids = (body: { data: { id: string }[] }) => body.data.map((user) => user.id)

  /** Follows `links.next` to the end, collecting every page. */
  const walk = async (first: string) => {
    const pages: any[] = []
    let next: string | null = first
    while (next !== null) {
      const body = await json(await t.request(next))
      pages.push(body)
      next = body.links.next
      expect(pages.length).toBeLessThan(50) // a loop would never end
    }
    return pages
  }

  beforeAll(async () => {
    for (let i = 1; i <= 7; i += 1) await createUser(`Page${i}@example.com`, `P${i % 3}`)
  })

  it('reports the limit and the cursor in metadata, and navigation in links', async () => {
    const body = await json(await t.request('/api/users?limit=2&sort_by=email'))
    expect(body.data).toHaveLength(2)
    expect(body.metadata).toMatchObject({ limit: 2, has_more: true })
    expect(typeof body.metadata.next_cursor).toBe('string')
    expect(body.metadata).not.toHaveProperty('total_items')
    expect(body.links.self).toBe('/api/users?limit=2&sort_by=email')
    expect(body.links.first).toBe('/api/users?limit=2&sort_by=email')
    expect(body.links.next).toBe(
      `/api/users?limit=2&sort_by=email&cursor=${body.metadata.next_cursor}`
    )
    expect(body.links).not.toHaveProperty('prev')
  })

  it.each([
    ['id', 'asc'],
    ['id', 'desc'],
    ['email', 'asc'],
    ['email', 'desc'],
    ['name', 'asc'],
    ['name', 'desc']
  ])('walks every user once, in order, sorted by %s %s', async (sortBy, sortOrder) => {
    const pages = await walk(`/api/users?limit=3&sort_by=${sortBy}&sort_order=${sortOrder}`)
    const users = pages.flatMap((page) => page.data) as Record<string, string>[]

    const everything = await json(
      await t.request(`/api/users?limit=100&sort_by=${sortBy}&sort_order=${sortOrder}`)
    )
    expect(everything.metadata.has_more).toBe(false)
    expect(users.map((user) => user.id)).toEqual(ids(everything))
    expect(new Set(users.map((user) => user.id)).size).toBe(users.length)

    // Ties on name are broken by id in the same direction, so the whole order is total.
    const order = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1)
    const sorted = [...users].sort((a, b) => {
      const result = order(a[sortBy] ?? '', b[sortBy] ?? '') || order(a['id'] ?? '', b['id'] ?? '')
      return sortOrder === 'asc' ? result : -result
    })
    expect(users).toEqual(sorted)
    expect(pages.at(-1).metadata).toMatchObject({ has_more: false, next_cursor: null })
  })

  it('answers an exhausted list with an empty page and no next', async () => {
    const first = await json(await t.request('/api/users?limit=100'))
    expect(first.metadata.has_more).toBe(false)
    expect(first.links.next).toBeNull()
  })

  it('refuses a cursor that is garbage, or belongs to another sort', async () => {
    const bad = await t.request('/api/users?cursor=garbage')
    expect(bad.status).toBe(400)
    expect((await json(bad)).error.code).toBe('VALIDATION_FAILED')

    const byName = await json(await t.request('/api/users?limit=1&sort_by=name'))
    for (const query of ['', '&sort_by=email', '&sort_by=name&sort_order=desc']) {
      const response = await t.request(`/api/users?cursor=${byName.metadata.next_cursor}${query}`)
      expect(response.status).toBe(400)
    }
  })

  it('has no way to read the whole table in one request', async () => {
    for (const query of [
      'limit=-1',
      'limit=101',
      'limit=0',
      'limit=1e2',
      'limit=0x10',
      'limit=+5',
      'limit=5.0',
      'limit='
    ]) {
      const response = await t.request(`/api/users?${query}`)
      expect(response.status).toBe(400)
      expect((await json(response)).error.code).toBe('VALIDATION_FAILED')
    }
    // `page` is gone: it is ignored, and the first page comes back.
    const body = await json(await t.request('/api/users?page=3&limit=2'))
    expect(body.data).toHaveLength(2)
  })

  it('sorts only by an allow-listed column', async () => {
    expect((await t.request('/api/users?sort_by=password')).status).toBe(400)
    expect((await t.request('/api/users?sort_order=sideways')).status).toBe(400)
  })

  it('returns only the declared fields', async () => {
    const body = await json(await t.request('/api/users?limit=1'))
    expect(Object.keys(body.data[0]).sort()).toEqual(['email', 'id', 'name'])
  })
})
