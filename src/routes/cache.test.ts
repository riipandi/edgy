import { afterEach, describe, expect, it } from '@effect/vitest'
import { makeTestApp, type TestApp } from '../../tests/app.ts'
import { DatabaseService } from '../database/service.ts'

let t: TestApp | undefined
afterEach(async () => {
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
