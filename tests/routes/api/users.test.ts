import { Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import {
  testConfig,
  testServices,
  toHandler,
  unavailableUserService,
  users,
  readyService
} from './fixtures.ts'

const { handler, dispose } = toHandler(testServices, testConfig)
const { handler: unavailableUsersHandler, dispose: disposeUnavailableUsersHandler } = toHandler(
  Layer.mergeAll(unavailableUserService, readyService),
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
