import { describe, expect, it } from '@effect/vitest'
import { H3 } from 'h3'
import { makeTestApp } from '../../../tests/app.ts'
import { type AssetSource, assetRoutes } from './assets.ts'
import { directoryAssets } from './node_assets.ts'

const files = new Map([['/assets/app-1a2b3c.js', 'export {}']])

const memory: AssetSource = {
  meta: (id) => (files.has(id) ? { size: files.get(id)?.length ?? 0 } : undefined),
  contents: (id) => files.get(id)
}

const app = new H3({ plugins: [assetRoutes(memory)] })
const get = (path: string, method = 'GET') => app.fetch(new Request(`http://t${path}`, { method }))

describe('/assets', () => {
  it('serves a built file with a cache that never expires, since the name is its hash', async () => {
    const response = await get('/assets/app-1a2b3c.js')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await response.text()).toBe('export {}')
  })

  it('answers HEAD without a body', async () => {
    const response = await get('/assets/app-1a2b3c.js', 'HEAD')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('answers 404 for a file that is not there', async () => {
    expect((await get('/assets/missing.js')).status).toBe(404)
  })

  it('does not let a request climb out of the asset root', async () => {
    for (const path of [
      '/assets/..%2f..%2fsecret',
      '/assets/%2e%2e/secret',
      '/assets//etc/passwd'
    ]) {
      expect([400, 404]).toContain((await get(path)).status)
    }
  })
})

describe('/assets in the application', () => {
  it('is served with the headers every response carries, and is unknown without a source', async () => {
    const served = await makeTestApp({}, { assets: memory })
    const bare = await makeTestApp()
    try {
      const hit = await served.request('/assets/app-1a2b3c.js')
      expect(hit.status).toBe(200)
      expect(hit.headers.get('x-content-type-options')).toBe('nosniff')
      expect(hit.headers.get('x-request-id')).toBeTruthy()
      await hit.text()

      const miss = await served.request('/assets/nope.js')
      expect(miss.status).toBe(404)
      expect(miss.headers.get('content-type')).toContain('text/html')
      await miss.text()

      expect((await bare.request('/assets/app-1a2b3c.js')).status).toBe(404)
    } finally {
      await served.dispose()
      await bare.dispose()
    }
  })
})

describe('directoryAssets', () => {
  const source = directoryAssets(new URL('../../../app/styles', import.meta.url).pathname)

  it('reads a file under its root', async () => {
    expect((await source.meta('/theme.css.ts'))?.size).toBeGreaterThan(0)
    expect(await source.contents('/theme.css.ts')).toBeInstanceOf(Uint8Array)
  })

  it.each([
    '/../theme.css.ts',
    '/../../package.json',
    '/a/../theme.css.ts',
    '/\\theme.css.ts',
    '/..',
    '/'
  ])('refuses %s', async (id) => {
    expect(await source.meta(id)).toBeUndefined()
    expect(await source.contents(id)).toBeUndefined()
  })
})
