import { afterAll, describe, expect, it } from 'vite-plus/test'
import { toHandler } from '../../fixtures/api.ts'
import { testConfig } from '../../fixtures/config.ts'
import { readyService, unavailableService } from '../../fixtures/database.ts'
import { testServices } from '../../fixtures/users.ts'

const { handler, dispose } = toHandler(testServices, testConfig, readyService)
const { handler: unavailableHandler, dispose: disposeUnavailableHandler } = toHandler(
  testServices,
  testConfig,
  unavailableService
)

afterAll(() => Promise.all([dispose(), disposeUnavailableHandler()]))

describe('GET /api/health', () => {
  it('responds 200 when the database answers the readiness probe', async () => {
    const response = await handler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('responds 503 when the database readiness probe fails', async () => {
    const response = await unavailableHandler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ _tag: 'ServiceUnavailable' })
  })
})

describe('GET /api/live', () => {
  it('responds 200 without touching the database', async () => {
    const response = await handler(new Request('http://localhost/api/live'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('still answers 200 when the database is down, unlike the readiness probe', async () => {
    const response = await unavailableHandler(new Request('http://localhost/api/live'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
