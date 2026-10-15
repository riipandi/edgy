import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer, ManagedRuntime } from 'effect'
import { makeTestApp, type TestApp } from '../../../tests/app.ts'
import { MISSING_USER_ID } from '../../../tests/ids.ts'
import { LocalCachePersistence } from '../../kernel/cache/local.ts'
import { ConfigLayer } from '../../kernel/config/service.ts'
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
    const miss = await t.run(Effect.flip(UserService.use((users) => users.get(MISSING_USER_ID))))
    expect(miss).toBeInstanceOf(NotFound)

    const created = await t.run(
      UserService.use((users) => users.create({ email: 'cache@example.com', name: 'Cache' }))
    )
    expect(created.id).toMatch(/^user_[0-7][0-9a-hjkmnp-tv-z]{25}$/)

    const found = await t.run(UserService.use((users) => users.get(created.id)))
    expect(found.email).toBe('cache@example.com')
  })
})

const SEVEN = 'user_0000000000000000000000000z'

describe('UserService cache and failures', () => {
  it('does not keep serving a database failure from the cache', async () => {
    let calls = 0
    const repository = UserRepository.of({
      findById: () =>
        calls++ === 0
          ? Effect.fail(new DatabaseError({ cause: new Error('SQLITE_BUSY') }))
          : Effect.succeed({ id: SEVEN, email: 'seven@example.com', name: 'Seven' }),
      findPage: () => Effect.die('unused'),
      insert: () => Effect.die('unused')
    })
    const runtime = ManagedRuntime.make(
      UserService.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(UserRepository, repository),
            LocalCachePersistence,
            ConfigLayer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({}))))
          )
        )
      )
    )

    try {
      const first = await runtime.runPromise(
        Effect.flip(UserService.use((users) => users.get(SEVEN)))
      )
      expect(first).toBeInstanceOf(DatabaseError)

      // The next request must retry the database, not replay the old failure.
      const second = await runtime.runPromise(UserService.use((users) => users.get(SEVEN)))
      expect(second.email).toBe('seven@example.com')
      expect(calls).toBe(2)
    } finally {
      await runtime.dispose()
    }
  })
})
