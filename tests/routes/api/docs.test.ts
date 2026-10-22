import { afterAll, describe, expect, it } from 'vite-plus/test'
import { docsConfig, testConfig, testServices, toHandler } from './fixtures.ts'

const { handler: docsHandler, dispose: disposeDocsHandler } = toHandler(testServices, docsConfig)
const { handler, dispose } = toHandler(testServices, testConfig)

afterAll(() => Promise.all([dispose(), disposeDocsHandler()]))

describe('API docs', () => {
  it('serves the OpenAPI document when enabled', async () => {
    const response = await docsHandler(new Request('http://localhost/oapi/openapi.json'))
    expect(response.status).toBe(200)
    const spec = await response.json()
    expect(spec.paths['/api/health']).toBeDefined()
    expect(spec.info.title).toBe('edgy')
  })

  it('serves the Scalar API reference when enabled', async () => {
    const response = await docsHandler(new Request('http://localhost/api-docs'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('hides the docs endpoints when disabled', async () => {
    const hidden = await handler(new Request('http://localhost/api-docs'))
    expect(hidden.status).toBe(404)
    const spec = await handler(new Request('http://localhost/oapi/openapi.json'))
    expect(spec.status).toBe(404)
  })
})
