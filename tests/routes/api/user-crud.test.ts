import type { Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { applicationServices } from '#/kernel/registry.ts'
import { toHandler } from '../../fixtures/api.ts'
import { testConfig } from '../../fixtures/config.ts'
import { migratedDatabaseFor } from '../../fixtures/database.ts'

const { handler, dispose } = toHandler(
  // The fixture provides AppConfig and Database further down the stack; the
  // cast matches the fixture's service parameter.
  applicationServices as Layer.Layer<any>,
  testConfig,
  migratedDatabaseFor('user-crud.db')
)

afterAll(() => dispose())

const post = (path: string, body: unknown) =>
  handler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  )

const patch = (path: string, body: unknown) =>
  handler(
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
    expect(body).toMatchObject({ email: 'new@example.com', name: 'New User', role: 10 })
    expect(body.id).toMatch(/^user_/)
    expect(body.created_at).toBeTruthy()
  })

  it('responds 409 when the email is already taken', async () => {
    const first = await post('/api/users', { email: 'duplicate@example.com' })
    expect(first.status).toBe(201)
    const response = await post('/api/users', { email: 'duplicate@example.com' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ _tag: 'Conflict' })
  })

  it('responds 400 for a blank email', async () => {
    const response = await post('/api/users', { email: '   ' })
    expect(response.status).toBe(400)
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
    expect((await response.json()).avatar_url).toBe('https://example.com/avatar.png')
  })
})

describe('PATCH /api/users/:id', () => {
  let createdId: string

  it('creates a user to patch', async () => {
    const response = await post('/api/users', { email: 'patch@example.com', name: 'Patch Me' })
    expect(response.status).toBe(201)
    createdId = (await response.json()).id
    expect(createdId).toMatch(/^user_/)
  })

  it('merges the patch and leaves absent fields unchanged', async () => {
    const response = await patch(`/api/users/${createdId}`, { name: 'Patched Name' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: createdId,
      name: 'Patched Name',
      email: 'patch@example.com'
    })
  })

  it('clears a value with an explicit null', async () => {
    const response = await patch(`/api/users/${createdId}`, { name: null })
    expect(response.status).toBe(200)
    expect((await response.json()).name).toBeNull()
  })

  it('responds 409 when the email belongs to another user', async () => {
    await post('/api/users', { email: 'ada@example.com', name: 'Ada Lovelace' })
    const response = await patch(`/api/users/${createdId}`, { email: 'ada@example.com' })
    expect(response.status).toBe(409)
  })

  it('accepts keeping the user’s own email', async () => {
    const response = await patch(`/api/users/${createdId}`, { email: 'patch@example.com' })
    expect(response.status).toBe(200)
  })

  it('responds 404 for an unknown id', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await patch(`/api/users/${missing}`, { name: 'Nobody' })
    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/users/:id', () => {
  it('responds 204 and the record is gone afterwards', async () => {
    const created = await post('/api/users', { email: 'gone@example.com' })
    const id = (await created.json()).id

    const response = await handler(
      new Request(`http://localhost/api/users/${id}`, { method: 'DELETE' })
    )
    expect(response.status).toBe(204)

    const lookup = await handler(new Request(`http://localhost/api/users/${id}`))
    expect(lookup.status).toBe(404)
  })

  it('responds 404 when the record is already gone', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await handler(
      new Request(`http://localhost/api/users/${missing}`, { method: 'DELETE' })
    )
    expect(response.status).toBe(404)
  })
})

describe('write path cache invalidation', () => {
  it('serves the updated name as a miss after a patch', async () => {
    const created = await post('/api/users', { email: 'cache@example.com', name: 'Before' })
    const id = (await created.json()).id

    const warmed = await handler(new Request(`http://localhost/api/users/${id}`))
    expect(warmed.headers.get('x-cache')).toBe('miss')

    const cached = await handler(new Request(`http://localhost/api/users/${id}`))
    expect(cached.headers.get('x-cache')).toBe('hit')

    await patch(`/api/users/${id}`, { name: 'After' })

    const refreshed = await handler(new Request(`http://localhost/api/users/${id}`))
    expect(refreshed.headers.get('x-cache')).toBe('miss')
    expect((await refreshed.json()).name).toBe('After')
  })
})
