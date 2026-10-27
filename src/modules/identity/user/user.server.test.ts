import { expect, it } from 'vite-plus/test'
import { fetchUserPage } from './user.server.ts'

// The route boundary receives the raw route param; an unparseable id resolves
// to no user instead of failing the render, and this holds before any request
// context exists.
it('answers no user for an id that is not a user TypeID', async () => {
  expect(await fetchUserPage('not-a-typeid')).toBeUndefined()
})
