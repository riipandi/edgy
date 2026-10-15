import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { NotFound } from '../../kernel/errors.ts'
import { UserService } from './user_service.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeTestApp()
})
afterAll(() => t.dispose())

describe('UserService cache', () => {
  it('does not keep answering "not found" for an id that was created afterwards', async () => {
    const miss = await t.run(Effect.flip(UserService.use((users) => users.get(1))))
    expect(miss).toBeInstanceOf(NotFound)

    const created = await t.run(
      UserService.use((users) => users.create({ email: 'cache@example.com' }))
    )
    expect(created.id).toBe(1)

    const found = await t.run(UserService.use((users) => users.get(1)))
    expect(found.email).toBe('cache@example.com')
  })
})
