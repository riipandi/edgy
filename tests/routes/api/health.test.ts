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

  it('answers 200 while the rate-limit store is unreadable; other routes stay fail-closed', async () => {
    const live = await unwritableStoreHandler(new Request('http://localhost/api/live'))
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ status: 'ok' })

    const limited = await unwritableStoreHandler(new Request('http://localhost/api/users'))
    expect(limited.status).toBe(503)
    expect(limited.headers.get('content-type')).toContain('text/plain')
  })
})
