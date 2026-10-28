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
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.details.database).toMatchObject({ status: 'up' })
    expect(typeof body.details.database.timestamp).toBe('string')
  })

  it('responds 503 when the database readiness probe fails', async () => {
    const response = await unavailableHandler(new Request('http://localhost/api/health'))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe('unhealthy')
    expect(body.details.database).toMatchObject({ status: 'down' })
    // The body names the dependency with a stable code; the raw error text
    // stays in the logs.
    expect(body.details.database.error).toBe('unavailable')
  })

  it('answers 200 while the rate-limit store is unreadable; the probe is exempt from the limiter', async () => {
    const health = await unwritableStoreHandler(new Request('http://localhost/api/health'))
    expect(health.status).toBe(200)
    expect((await health.json()).status).toBe('ok')

    // The throttled routes keep failing closed on the same store, with the
    // error envelope the contract requires.
    const limited = await unwritableStoreHandler(new Request('http://localhost/api/users'))
    expect(limited.status).toBe(503)
    const body = (await limited.json()) as {
      status: string
      message: string
      error: { code: string; retryable: boolean }
      metadata: { status_code: number }
    }
    expect(body.status).toBe('error')
    expect(body.message).toBe('Rate limit store unavailable')
    expect(body.error.code).toBe('RATE_LIMIT_STORE_UNAVAILABLE')
    expect(body.error.retryable).toBe(true)
    expect(body.metadata.status_code).toBe(503)
  })
})
