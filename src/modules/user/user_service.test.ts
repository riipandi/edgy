import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { expect } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { config as fixtureConfig } from '../../../tests/fixtures/config.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import { parseUserId } from './user_schema.ts'
import { UserCache, UserService, UserServiceLayer } from './user_service.ts'

// A smaller cache than the fixture's so the eviction path is reachable.
const config: AppConfigShape = {
  ...fixtureConfig,
  cache: { ...fixtureConfig.cache, maxEntries: 16 }
}

const testConfig = Layer.succeed(AppConfig, config)

const ada = {
  id: TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8057').toString(),
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

it.effect('retries the lookup after a failed cache fill', () =>
  Effect.gen(function* () {
    let lookups = 0
    const flakyRepo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed([]),
        find: () => {
          lookups += 1
          return lookups === 1
            ? Effect.fail(new UserRepositoryError({ cause: new Error('offline') }))
            : Effect.succeed(ada)
        }
      })
    )
    const userDeps = Layer.mergeAll(flakyRepo, UserCache.layer).pipe(Layer.provide(flakyRepo))
    const service = yield* UserService.pipe(
      Effect.provide(UserServiceLayer.pipe(Layer.provide(userDeps), Layer.provide(testConfig)))
    )

    const userId = parseUserId(ada.id)
    const failed = yield* Effect.exit(service.find(userId))
    expect(failed._tag).toBe('Failure')

    // The failed entry was invalidated: the next request hits the repository
    // again instead of replaying the stale failure until the TTL expires.
    const recovered = yield* service.find(userId)
    expect(recovered.user?.name).toBe('Ada Lovelace')
    expect(recovered.cache).toBe('miss')
    expect(lookups).toBe(2)

    // The successful fill is cached.
    const cached = yield* service.find(userId)
    expect(cached.user?.name).toBe('Ada Lovelace')
    expect(cached.cache).toBe('hit')
    expect(lookups).toBe(2)
  })
)
