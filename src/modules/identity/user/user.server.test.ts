import { Effect } from 'effect'
import { TypeID } from 'typeid-js'
import { expect, it, vi } from 'vite-plus/test'
import { runWithPageMeta, type PageMeta } from '#/kernel/pagemeta.ts'
import { fetchUserPage } from './user.server.ts'
import { withUserService } from './user_context.ts'
import type { User } from './user_schema.ts'
import { UserService, type UserResult } from './user_service.ts'

// The route boundary receives the raw route param; an unparseable id resolves
// to no user instead of failing the render, and this holds before any request
// context exists.
it('answers no user for an id that is not a user TypeID', async () => {
  expect(await fetchUserPage('not-a-typeid')).toBeUndefined()
})

// fetchUserPage reads the page URL through Start's request accessor; the
// stub keeps the tests focused on the cache-bypass and meta-store behavior.
const requestState = vi.hoisted(() => ({ url: 'http://localhost/users/some-id' }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request(requestState.url)
}))

const adaId = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8057').toString()
const ada: User = {
  id: adaId,
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatar_url: null,
  role: 20,
  email_verified: 1,
  data: null,
  disabled: 0,
  created_at: '2024-01-01 00:00:00',
  updated_at: '2024-01-01 00:00:00'
}

const fakeService = (result: UserResult, seen: { bypass?: boolean } = {}) =>
  UserService.of({
    list: () => Effect.die('not exercised here'),
    find: (_id, bypass = false) => {
      seen.bypass = bypass
      return Effect.succeed(result)
    },
    create: () => Effect.die('not exercised here'),
    update: () => Effect.die('not exercised here'),
    remove: () => Effect.die('not exercised here')
  })

const read = (service: ReturnType<typeof fakeService>, state: PageMeta) =>
  runWithPageMeta(state, () => withUserService(service, () => fetchUserPage(adaId)))

it('publishes the cache status onto the page meta store', async () => {
  requestState.url = 'http://localhost/users/x'
  const state: PageMeta = {}
  const result = await read(fakeService({ user: ada, cache: 'miss' }), state)

  expect(result?.user.name).toBe('Ada Lovelace')
  expect(result?.cache).toBe('miss')
  expect(state.cache).toBe('miss')
})

it('bypasses the cache when the page request asks for it', async () => {
  requestState.url = 'http://localhost/users/x?nocache=1'
  const state: PageMeta = {}
  const seen: { bypass?: boolean } = {}
  const result = await read(fakeService({ user: ada, cache: 'bypass' }, seen), state)

  expect(seen.bypass).toBe(true)
  expect(result?.cache).toBe('bypass')
  expect(state.cache).toBe('bypass')
})

it('publishes the status even when the id matches no user', async () => {
  requestState.url = 'http://localhost/users/x'
  const state: PageMeta = {}
  const result = await read(fakeService({ user: undefined, cache: 'miss' }), state)

  expect(result).toBeUndefined()
  expect(state.cache).toBe('miss')
})
