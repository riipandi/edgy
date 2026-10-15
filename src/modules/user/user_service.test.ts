import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { DatabaseError, NotFound } from '../../kernel/errors.ts'
import { UserRepository } from './user_repo.ts'
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

describe('UserService cache and failures', () => {
  it('does not keep serving a database failure from the cache', async () => {
    let calls = 0
    const repository = UserRepository.of({
      findById: () =>
        calls++ === 0
          ? Effect.fail(new DatabaseError({ cause: new Error('SQLITE_BUSY') }))
          : Effect.succeed({ id: 7, email: 'seven@example.com', name: null }),
      findPage: () => Effect.die('unused'),
      insert: () => Effect.die('unused')
    })
    const runtime = ManagedRuntime.make(
      UserService.layer.pipe(Layer.provide(Layer.succeed(UserRepository, repository)))
    )

    try {
      const first = await runtime.runPromise(Effect.flip(UserService.use((users) => users.get(7))))
      expect(first).toBeInstanceOf(DatabaseError)

      // The next request must retry the database, not replay the old failure.
      const second = await runtime.runPromise(UserService.use((users) => users.get(7)))
      expect(second.email).toBe('seven@example.com')
      expect(calls).toBe(2)
    } finally {
      await runtime.dispose()
    }
  })
})
