import { afterEach, describe, expect, it, vi } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { DatabaseService } from '../database/service.ts'

let t: TestApp | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await t?.dispose()
  t = undefined
})

/** Creates a user, reads it once (so it is cached), then renames it behind the cache's back. */
const renamedBehindTheCache = async (app: TestApp): Promise<string> => {
  const created = await app.request('/api/users', {
    method: 'POST',
    body: { email: 'cached@example.com', name: 'Before' }
  })
  const id: string = (await created.json()).data.id
  await app.request(`/api/users/${id}`) // fills the cache
  await app.run(
    DatabaseService.use(({ query }) =>
      query((db) => db.updateTable('users').set({ name: 'After' }).where('id', '=', id).execute())
    )
  )
  return id
}

const nameOf = async (response: Response): Promise<string> => (await response.json()).data.name

describe('read cache over HTTP', () => {
  it('serves a cached user until it is bypassed with ?nocache=true', async () => {
    t = await makeTestApp()
    const id = await renamedBehindTheCache(t)

    expect(await nameOf(await t.request(`/api/users/${id}`))).toBe('Before')
    expect(await nameOf(await t.request(`/api/users/${id}?nocache=true`))).toBe('After')
    // the bypass reads the source; it does not refresh what everyone else is served
    expect(await nameOf(await t.request(`/api/users/${id}`))).toBe('Before')
  })

  it('only honours the exact value true', async () => {
    t = await makeTestApp()
    const id = await renamedBehindTheCache(t)
    for (const value of ['false', '1', '', 'TRUE']) {
      expect(await nameOf(await t.request(`/api/users/${id}?nocache=${value}`))).toBe('Before')
    }
  })

  it('reads the database every time when CACHE_ENABLED is false', async () => {
    t = await makeTestApp({ CACHE_ENABLED: 'false' })
    const id = await renamedBehindTheCache(t)
    expect(await nameOf(await t.request(`/api/users/${id}`))).toBe('After')
  })
})

describe('X-Cache header', () => {
  it('says MISS, HIT and BYPASS, and is absent when nothing was read through the cache', async () => {
    t = await makeTestApp()
    const created = await t.request('/api/users', {
      method: 'POST',
      body: { email: 'h@example.com', name: 'Test User' }
    })
    const id: string = (await created.json()).data.id

    const header = async (path: string) => (await t!.request(path)).headers.get('x-cache')
    expect(await header(`/api/users/${id}`)).toBe('MISS')
    expect(await header(`/api/users/${id}`)).toBe('HIT')
    expect(await header(`/api/users/${id}?nocache=true`)).toBe('BYPASS')
    expect(await header('/api/users')).toBeNull()
    expect(created.headers.get('x-cache')).toBeNull()
  })

  it('is on an error response too, and absent when the cache is off', async () => {
    t = await makeTestApp()
    const missing = await t.request('/api/users/user_00000000000000000000000000')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('x-cache')).toBe('MISS')

    await t.dispose()
    t = await makeTestApp({ CACHE_ENABLED: 'false' })
    const off = await t.request('/api/users/user_00000000000000000000000000')
    expect(off.headers.get('x-cache')).toBeNull()
  })
})

describe('metadata.cache', () => {
  it('says miss, hit and bypass in the envelope, the same as the header', async () => {
    t = await makeTestApp()
    const created = await t.request('/api/users', {
      method: 'POST',
      body: { email: 'm@example.com', name: 'Test User' }
    })
    const id: string = (await created.json()).data.id

    const seen: (string | undefined)[] = []
    for (const path of [`/api/users/${id}`, `/api/users/${id}`, `/api/users/${id}?nocache=true`]) {
      const response = await t.request(path)
      const { metadata } = await response.json()
      expect(response.headers.get('x-cache')).toBe(String(metadata.cache).toUpperCase())
      seen.push(metadata.cache)
    }
    expect(seen).toEqual(['miss', 'hit', 'bypass'])
  })

  it('is absent when nothing was read through the cache', async () => {
    t = await makeTestApp()
    const { metadata } = await (await t.request('/api/users')).json()
    expect(metadata).not.toHaveProperty('cache')
  })

  it('is in an error envelope too', async () => {
    t = await makeTestApp()
    const body = await (await t.request('/api/users/user_00000000000000000000000000')).json()
    expect(body.metadata.cache).toBe('miss')
  })
})

describe('request log', () => {
  /** The `cache` annotation of each request line printed while `run` ran, in order. */
  const cacheOfEach = async (env: Record<string, string>, paths: (id: string) => string[]) => {
    t = await makeTestApp({ ...env, LOG_LEVEL: 'Info', LOG_FORMAT: 'json' })
    const created = await t.request('/api/users', {
      method: 'POST',
      body: { email: 'log@example.com', name: 'Test User' }
    })
    const id: string = (await created.json()).data.id

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    for (const path of paths(id)) await t.request(path)
    await t.dispose()
    t = undefined

    return lines
      .filter((line) => line.includes('"method":"GET"'))
      .map((line) => (JSON.parse(line) as { annotations?: { cache?: string } }).annotations?.cache)
  }

  it('says miss, hit and bypass', async () => {
    const cache = await cacheOfEach({}, (id) => [
      `/api/users/${id}`,
      `/api/users/${id}`,
      `/api/users/${id}?nocache=true`
    ])
    expect(cache).toEqual(['miss', 'hit', 'bypass'])
  })

  it('says nothing about a request that read nothing through the cache', async () => {
    const cache = await cacheOfEach({}, () => ['/api/users'])
    expect(cache).toEqual([undefined])
  })

  it('says nothing when the cache is off', async () => {
    const cache = await cacheOfEach({ CACHE_ENABLED: 'false' }, (id) => [`/api/users/${id}`])
    expect(cache).toEqual([undefined])
  })
})
