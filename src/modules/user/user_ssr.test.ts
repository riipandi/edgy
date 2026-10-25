import { expect, it } from 'vite-plus/test'
import { getUserFromService } from './user_ssr.ts'

// The SSR boundary receives the raw route param; an unparseable id resolves to
// no user instead of crashing the render, and this holds before any request
// context exists.
it('answers no user for an id that is not a user TypeID', async () => {
  expect(await getUserFromService('not-a-typeid')).toBeUndefined()
})
