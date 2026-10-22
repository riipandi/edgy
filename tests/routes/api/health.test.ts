import { Layer } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { testConfig, testService, testServices, toHandler, unavailableService } from './fixtures.ts'

const { handler, dispose } = toHandler(testServices, testConfig)
const { handler: unavailableHandler, dispose: disposeUnavailableHandler } = toHandler(
  Layer.mergeAll(testService, unavailableService),
  testConfig
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
