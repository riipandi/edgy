import { afterAll, describe, expect, it } from 'vite-plus/test'
import { toHandler } from '../../fixtures/api.ts'
import { testConfig } from '../../fixtures/config.ts'
import {
  readyService,
  unavailableService,
  unwritableStoreService
} from '../../fixtures/database.ts'
import { testServices } from '../../fixtures/users.ts'

const { handler, dispose } = toHandler(testServices, testConfig, readyService)
const { handler: unavailableHandler, dispose: disposeUnavailableHandler } = toHandler(
  testServices,
  testConfig,
  unavailableService
)
const { handler: unwritableStoreHandler, dispose: disposeUnwritableStoreHandler } = toHandler(
  testServices,
  testConfig,
  unwritableStoreService
)

afterAll(() =>
  Promise.all([dispose(), disposeUnavailableHandler(), disposeUnwritableStoreHandler()])
)

describe('GET /api/health', () => {
  it('responds 200 when the database answers the readiness probe', async () => {
    const response = await handler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('responds 503 when the database readiness probe fails', async () => {
    const response = await unavailableHandler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unhealthy' })
  })

  it('answers 503 while the rate-limit store is unreadable; the store failure stays fail-closed', async () => {
    const health = await unwritableStoreHandler(new Request('http://localhost/api/health'))
    expect(health.status).toBe(503)
    expect(health.headers.get('content-type')).toContain('text/plain')

    const limited = await unwritableStoreHandler(new Request('http://localhost/api/users'))
    expect(limited.status).toBe(503)
    expect(limited.headers.get('content-type')).toContain('text/plain')
  })
})
