import type { Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { identityLayer } from '#/modules/identity/module.ts'
import { toHandler } from '../../fixtures/api.ts'
import { testConfig } from '../../fixtures/config.ts'
import { migratedDatabaseFor } from '../../fixtures/database.ts'
import { testServices, unavailableUserService, users } from '../../fixtures/users.ts'

const { handler, dispose } = toHandler(testServices, testConfig)
const { handler: unavailableUsersHandler, dispose: disposeUnavailableUsersHandler } = toHandler(
  unavailableUserService,
  testConfig
)
// The write surface runs against the real service composition and its own
// database, so created records never touch the fake the read tests share.
const { handler: writeHandler, dispose: disposeWriteHandler } = toHandler(
  identityLayer as Layer.Layer<any>,
  testConfig,
  migratedDatabaseFor('users-write.db')
)

afterAll(() => Promise.all([dispose(), disposeUnavailableUsersHandler(), disposeWriteHandler()]))

describe('GET /api/users', () => {
  it('responds 200 with the seeded user list in a success envelope', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('success')
    expect(body.metadata).toMatchObject({ status_code: 200 })
    expect(body.data).toHaveLength(2)
    expect(body.data.map((entry: { name: string }) => entry.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper'
    ])
  })

  it('publishes the public projection only', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    const { data } = await response.json()
    expect(Object.keys(data[0]).sort()).toEqual([
      'avatar_url',
      'created_at',
      'email',
      'id',
      'name',
      'role'
    ])
  })

  it('carries pagination metadata', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    const { metadata } = await response.json()
    expect(metadata).toMatchObject({ limit: 20, has_more: false, next_cursor: null })
  })

  it('responds 400 with INVALID_CURSOR for a cursor that parses but has the wrong shape', async () => {
    const response = await handler(
      new Request(`http://localhost/api/users?cursor=${Buffer.from('null').toString('base64url')}`)
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({ code: 'INVALID_CURSOR', retryable: false })
  })

  it('maps repository failures to a sanitized 503 error envelope', async () => {
    const response = await unavailableUsersHandler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.message).toBeTruthy()
    expect(body.error).toMatchObject({ code: 'DATABASE_ERROR', retryable: true })
  })
})

describe('GET /api/users/:id', () => {
  it('responds 200 with the requested user in a success envelope', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('success')
    expect(body.data).toMatchObject({ name: 'Ada Lovelace' })
  })

  it('keeps the storage columns out of the detail response', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    const { data } = await response.json()
    expect(data).not.toHaveProperty('data')
    expect(data).not.toHaveProperty('email_verified')
    expect(data).not.toHaveProperty('disabled')
    expect(data).not.toHaveProperty('updated_at')
  })

  it('reports the cache status in the envelope metadata', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    const { metadata } = await response.json()
    expect(metadata.cache).toBe('disabled')
  })

  it('skips the cache when the nocache query param is 1', async () => {
    const response = await handler(
      new Request(`http://localhost/api/users/${users[0]!.id}?nocache=1`)
    )
    expect(response.status).toBe(200)
    expect((await response.json()).metadata.cache).toBe('bypass')
  })

  it('responds 400 with a validation error envelope for a non-TypeID id', async () => {
    const response = await handler(new Request('http://localhost/api/users/not-a-typeid'))
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { kind: 'Params', issue: expect.stringContaining('["id"]') }
    })
  })

  it('responds 404 with an error envelope for an unknown id', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await handler(new Request(`http://localhost/api/users/${missing}`))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.message).toBe('User not found')
    expect(body.error).toMatchObject({ code: 'USER_NOT_FOUND', retryable: false })
  })
})

describe('unknown API path', () => {
  it('responds 404 with an error envelope for an unknown path', async () => {
    const response = await handler(new Request('http://localhost/api/nope'))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', retryable: false })
  })

  it('responds 404 with an error envelope for an unregistered method', async () => {
    const response = await handler(new Request('http://localhost/api/users', { method: 'PUT' }))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', retryable: false })
  })
})

const post = (path: string, body: unknown) =>
  writeHandler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  )

const rawPost = (path: string, body: string) =>
  writeHandler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
  )

const patch = (path: string, body: unknown) =>
  writeHandler(
    new Request(`http://localhost${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  )

describe('POST /api/users', () => {
  it('responds 201 with the created user and defaults role to 10', async () => {
    const response = await post('/api/users', { email: 'new@example.com', name: 'New User' })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.status).toBe('success')
    expect(body.metadata.status_code).toBe(201)
    expect(body.data).toMatchObject({ email: 'new@example.com', name: 'New User', role: 10 })
    expect(body.data.id).toMatch(/^user_/)
    expect(body.data.created_at).toBeTruthy()
  })

  it('responds 409 with an error envelope when the email is already taken', async () => {
    const first = await post('/api/users', { email: 'duplicate@example.com' })
    expect(first.status).toBe(201)
    const response = await post('/api/users', { email: 'duplicate@example.com' })
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({
      code: 'EMAIL_CONFLICT',
      retryable: false,
      details: { email: 'duplicate@example.com' }
    })
  })

  it('responds 409 (not 503) when two concurrent creates take one email', async () => {
    const [first, second] = await Promise.all([
      post('/api/users', { email: 'race@example.com' }),
      post('/api/users', { email: 'race@example.com' })
    ])
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 409])
  })

  it('responds 400 with a validation error envelope for a blank email', async () => {
    const response = await post('/api/users', { email: '   ' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { kind: 'Payload', issue: expect.stringContaining('["email"]') }
    })
  })

  it('responds 400 with a validation error envelope for a body that is not JSON', async () => {
    const response = await rawPost('/api/users', '{not json')
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { kind: 'Payload', issue: expect.stringContaining('JSON') }
    })
  })

  it('responds 400 for a malformed email', async () => {
    const response = await post('/api/users', { email: 'not-an-email' })
    expect(response.status).toBe(400)
  })

  it('responds 400 for an email past its length budget', async () => {
    const response = await post('/api/users', {
      email: `${'a'.repeat(250)}@example.com`
    })
    expect(response.status).toBe(400)
  })

  it('responds 400 for a blank name', async () => {
    const response = await post('/api/users', { email: 'blank-name@example.com', name: '   ' })
    expect(response.status).toBe(400)
  })

  it('responds 400 for a name past its length budget', async () => {
    const response = await post('/api/users', {
      email: 'long-name@example.com',
      name: 'x'.repeat(201)
    })
    expect(response.status).toBe(400)
  })

  it('responds 400 for a non-absolute avatar URL', async () => {
    const response = await post('/api/users', {
      email: 'avatar@example.com',
      avatar_url: 'not-a-url'
    })
    expect(response.status).toBe(400)
  })

  it('accepts a valid avatar URL', async () => {
    const response = await post('/api/users', {
      email: 'avatar-ok@example.com',
      avatar_url: 'https://example.com/avatar.png'
    })
    expect(response.status).toBe(201)
    expect((await response.json()).data.avatar_url).toBe('https://example.com/avatar.png')
  })
})

describe('PATCH /api/users/:id', () => {
  let createdId: string

  it('creates a user to patch', async () => {
    const response = await post('/api/users', { email: 'patch@example.com', name: 'Patch Me' })
    expect(response.status).toBe(201)
    createdId = (await response.json()).data.id
    expect(createdId).toMatch(/^user_/)
  })

  it('merges the patch and leaves absent fields unchanged', async () => {
    const response = await patch(`/api/users/${createdId}`, { name: 'Patched Name' })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({
      id: createdId,
      name: 'Patched Name',
      email: 'patch@example.com'
    })
  })

  it('clears a value with an explicit null', async () => {
    const response = await patch(`/api/users/${createdId}`, { name: null })
    expect(response.status).toBe(200)
    expect((await response.json()).data.name).toBeNull()
  })

  it('patches the avatar URL', async () => {
    const response = await patch(`/api/users/${createdId}`, {
      avatar_url: 'https://example.com/avatar.png'
    })
    expect(response.status).toBe(200)
    expect((await response.json()).data.avatar_url).toBe('https://example.com/avatar.png')
  })

  it('responds 409 when the email belongs to another user', async () => {
    await post('/api/users', { email: 'ada@example.com', name: 'Ada Lovelace' })
    const response = await patch(`/api/users/${createdId}`, { email: 'ada@example.com' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatchObject({ code: 'EMAIL_CONFLICT' })
  })

  it('accepts keeping the user’s own email', async () => {
    const response = await patch(`/api/users/${createdId}`, { email: 'patch@example.com' })
    expect(response.status).toBe(200)
  })

  it('responds 404 for an unknown id', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await patch(`/api/users/${missing}`, { name: 'Nobody' })
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatchObject({ code: 'USER_NOT_FOUND' })
  })
})

describe('DELETE /api/users/:id', () => {
  it('responds 200 with an empty success envelope and the record is gone afterwards', async () => {
    const created = await post('/api/users', { email: 'gone@example.com' })
    const id = (await created.json()).data.id

    const response = await writeHandler(
      new Request(`http://localhost/api/users/${id}`, { method: 'DELETE' })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('success')
    expect(body).not.toHaveProperty('data')

    const lookup = await writeHandler(new Request(`http://localhost/api/users/${id}`))
    expect(lookup.status).toBe(404)
  })

  it('responds 404 when the record is already gone', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await writeHandler(
      new Request(`http://localhost/api/users/${missing}`, { method: 'DELETE' })
    )
    expect(response.status).toBe(404)
  })
})

describe('write path cache invalidation', () => {
  it('serves the updated name as a miss after a patch', async () => {
    const created = await post('/api/users', { email: 'cache@example.com', name: 'Before' })
    const id = (await created.json()).data.id

    const warmed = await writeHandler(new Request(`http://localhost/api/users/${id}`))
    expect((await warmed.json()).metadata.cache).toBe('miss')

    const cached = await writeHandler(new Request(`http://localhost/api/users/${id}`))
    expect((await cached.json()).metadata.cache).toBe('hit')

    await patch(`/api/users/${id}`, { name: 'After' })

    const refreshed = await writeHandler(new Request(`http://localhost/api/users/${id}`))
    const refreshedBody = await refreshed.json()
    expect(refreshedBody.metadata.cache).toBe('miss')
    expect(refreshedBody.data.name).toBe('After')
  })
})
