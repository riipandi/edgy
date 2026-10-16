import { afterAll, describe, expect, it } from '@effect/vitest'
import { H3 } from 'h3'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  const source = directoryAssets(new URL('../../../web/styles', import.meta.url).pathname)

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

describe('directoryAssets confinement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edgy-assets-'))
  const root = join(dir, 'public')
  mkdirSync(join(root, 'inner'), { recursive: true })
  writeFileSync(join(root, 'inner', 'ok.js'), 'ok')
  writeFileSync(join(root, '.secret'), 'hidden')
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.git', 'config'), 'x')
  writeFileSync(join(dir, 'outside.txt'), 'outside')
  symlinkSync(join(dir, 'outside.txt'), join(root, 'link.txt'))
  symlinkSync(dir, join(root, 'dirlink'))
  symlinkSync(join(root, 'inner', 'ok.js'), join(root, 'inside-link.js'))
  const source = directoryAssets(root)

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('serves a file, and a link that stays inside the root', async () => {
    expect(await source.meta('/inner/ok.js')).toMatchObject({ size: 2 })
    expect(await source.meta('/inside-link.js')).toMatchObject({ size: 2 })
  })

  it.each(['/link.txt', '/dirlink/outside.txt'])(
    'refuses %s, a link out of the root',
    async (id) => {
      expect(await source.meta(id)).toBeUndefined()
      expect(await source.contents(id)).toBeUndefined()
    }
  )

  it.each(['/.secret', '/.git/config', '/inner/.hidden'])('refuses the dotfile %s', async (id) => {
    expect(await source.meta(id)).toBeUndefined()
    expect(await source.contents(id)).toBeUndefined()
  })
})

describe('directoryAssets scope', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edgy-scope-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'a.js'), 'a')
  writeFileSync(join(dir, 'index.mjs'), 'server')
  const source = directoryAssets(dir, '/assets/')

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('serves only ids under the scope', async () => {
    expect(await source.meta('/assets/a.js')).toMatchObject({ size: 1 })
    expect(await source.meta('/index.mjs')).toBeUndefined()
    expect(await source.contents('/index.mjs')).toBeUndefined()
  })
})
