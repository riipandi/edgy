import { TypeID } from 'typeid-js'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { toHandler } from '../../fixtures/api.ts'
import { testConfig } from '../../fixtures/config.ts'
import { testServices, unavailableUserService, users } from '../../fixtures/users.ts'

const { handler, dispose } = toHandler(testServices, testConfig)
const { handler: unavailableUsersHandler, dispose: disposeUnavailableUsersHandler } = toHandler(
  unavailableUserService,
  testConfig
)

afterAll(() => Promise.all([dispose(), disposeUnavailableUsersHandler()]))

describe('GET /api/users', () => {
  it('responds 200 with the seeded user list', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(2)
    expect(body.map((entry: { name: string }) => entry.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper'
    ])
  })

  it('publishes the public projection only', async () => {
    const response = await handler(new Request('http://localhost/api/users'))
    const [first] = await response.json()
    expect(Object.keys(first).sort()).toEqual([
      'avatar_url',
      'created_at',
      'email',
      'id',
      'name',
      'role'
    ])
  })

  it('maps repository failures to a sanitized 503 response', async () => {
    const response = await unavailableUsersHandler(new Request('http://localhost/api/users'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ _tag: 'ServiceUnavailable' })
  })
})

describe('GET /api/users/:id', () => {
  it('responds 200 with the requested user', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'Ada Lovelace' })
  })

  it('keeps the storage columns out of the detail response', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    const body = await response.json()
    expect(body).not.toHaveProperty('data')
    expect(body).not.toHaveProperty('email_verified')
    expect(body).not.toHaveProperty('disabled')
    expect(body).not.toHaveProperty('updated_at')
  })

  it('reports the cache status in the x-cache header', async () => {
    const response = await handler(new Request(`http://localhost/api/users/${users[0]!.id}`))
    expect(response.headers.get('x-cache')).toBe('disabled')
  })

  it('skips the cache when the nocache query param is 1', async () => {
    const response = await handler(
      new Request(`http://localhost/api/users/${users[0]!.id}?nocache=1`)
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-cache')).toBe('bypass')
  })

  it('responds 400 for a non-TypeID id', async () => {
    const response = await handler(new Request('http://localhost/api/users/not-a-typeid'))
    expect(response.status).toBe(400)
  })

  it('responds 404 for an unknown id', async () => {
    const missing = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
    const response = await handler(new Request(`http://localhost/api/users/${missing}`))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ _tag: 'NotFound' })
  })
})

describe('unknown API path', () => {
  it('responds 404', async () => {
    const response = await handler(new Request('http://localhost/api/nope'))
    expect(response.status).toBe(404)
  })
})
