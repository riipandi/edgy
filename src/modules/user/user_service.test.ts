import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TypeID } from 'typeid-js'
import { expect } from 'vite-plus/test'
import { AppConfig, type AppConfigShape } from '#/kernel/config/config.ts'
import { config as fixtureConfig } from '../../../tests/fixtures/config.ts'
import { UserRepository, UserRepositoryError } from './user_repo.ts'
import type { User } from './user_schema.ts'
import { parseUserId } from './user_schema.ts'
import { UserCache, UserService, UserServiceLayer } from './user_service.ts'

// A smaller cache than the fixture's so the eviction path is reachable.
const config: AppConfigShape = {
  ...fixtureConfig,
  cache: { ...fixtureConfig.cache, maxEntries: 16 }
}

const testConfig = Layer.succeed(AppConfig, config)

const unknownId = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8059').toString()
const graceId = TypeID.fromUUID('user', '01890a5d-ac96-774b-bcce-b302099a8058').toString()

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
        },
        findByEmail: () => Effect.succeed(undefined),
        create: () => Effect.die('not exercised here'),
        update: () => Effect.die('not exercised here'),
        remove: () => Effect.die('not exercised here')
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

it.effect('create stores the user and refuses a duplicate email', () =>
  Effect.gen(function* () {
    const rows: Array<User> = []
    const repo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed(rows),
        find: (id) => Effect.succeed(rows.find((row) => row.id === id.toString())),
        findByEmail: (email) => Effect.succeed(rows.find((row) => row.email === email)),
        create: (id, values) => {
          const row: User = {
            ...ada,
            id: id.toString(),
            email: values.email,
            name: values.name,
            avatar_url: values.avatar_url
          }
          rows.push(row)
          return Effect.succeed(row)
        },
        update: () => Effect.die('covered by the merge test'),
        remove: () => Effect.die('covered by the delete test')
      })
    )
    const service = yield* UserService.pipe(
      Effect.provide(
        UserServiceLayer.pipe(
          Layer.provide(Layer.mergeAll(repo, UserCache.layer).pipe(Layer.provide(repo))),
          Layer.provide(testConfig)
        )
      )
    )

    const created = yield* service.create({
      email: 'new@example.com',
      name: 'New User',
      avatar_url: null
    })
    expect(created.email).toBe('new@example.com')
    expect(rows).toHaveLength(1)

    const conflict = yield* Effect.exit(
      service.create({ email: 'new@example.com', name: null, avatar_url: null })
    )
    expect(conflict._tag).toBe('Failure')
    expect(rows).toHaveLength(1)
  })
)

it.effect('update merges the patch, invalidates the cache, and reports misses', () =>
  Effect.gen(function* () {
    const rows: Array<User> = [{ ...ada }]
    const repo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed(rows),
        find: (id) => Effect.succeed(rows.find((row) => row.id === id.toString())),
        findByEmail: (email) => Effect.succeed(rows.find((row) => row.email === email)),
        create: () => Effect.die('covered by the create test'),
        update: (id, patch) => {
          const row = rows.find((candidate) => candidate.id === id.toString())
          if (row === undefined) return Effect.succeed(undefined)
          const merged: User = {
            ...row,
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {}),
            updated_at: '2024-01-02 00:00:00'
          }
          rows.splice(0, rows.length, merged)
          return Effect.succeed(merged)
        },
        remove: () => Effect.die('covered by the delete test')
      })
    )
    const service = yield* UserService.pipe(
      Effect.provide(
        UserServiceLayer.pipe(
          Layer.provide(Layer.mergeAll(repo, UserCache.layer).pipe(Layer.provide(repo))),
          Layer.provide(testConfig)
        )
      )
    )
    const userId = parseUserId(ada.id)

    // Fill the cache first: the update must drop the stale entry.
    const before = yield* service.find(userId)
    expect(before.cache).toBe('miss')

    const updated = yield* service.update(userId, { name: 'Ada K. Lovelace' })
    expect(updated?.name).toBe('Ada K. Lovelace')
    expect(updated?.email).toBe('ada@example.com')

    const after = yield* service.find(userId)
    expect(after.user?.name).toBe('Ada K. Lovelace')
    expect(after.cache).toBe('miss')

    const missing = yield* service.update(parseUserId(unknownId), { name: 'Nobody' })
    expect(missing).toBeUndefined()
  })
)

it.effect('update refuses an email owned by another user', () =>
  Effect.gen(function* () {
    const rows: Array<User> = [{ ...ada }]
    const grace: User = { ...ada, id: graceId, email: 'grace@example.com', name: 'Grace Hopper' }
    const repo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed(rows),
        find: (id) => Effect.succeed([grace, ...rows].find((row) => row.id === id.toString())),
        findByEmail: (email) => Effect.succeed([grace, ...rows].find((row) => row.email === email)),
        create: () => Effect.die('covered by the create test'),
        update: (id, patch) => {
          const row = [grace, ...rows].find((candidate) => candidate.id === id.toString())
          if (row === undefined) return Effect.succeed(undefined)
          const merged: User = {
            ...row,
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {})
          }
          return Effect.succeed(merged)
        },
        remove: () => Effect.die('covered by the delete test')
      })
    )
    const service = yield* UserService.pipe(
      Effect.provide(
        UserServiceLayer.pipe(
          Layer.provide(Layer.mergeAll(repo, UserCache.layer).pipe(Layer.provide(repo))),
          Layer.provide(testConfig)
        )
      )
    )

    const conflict = yield* Effect.exit(
      service.update(parseUserId(ada.id), { email: 'grace@example.com' })
    )
    expect(conflict._tag).toBe('Failure')

    // Her own email is not a conflict.
    const outcome = yield* service.update(parseUserId(ada.id), { email: 'ada@example.com' })
    expect(outcome).toBeDefined()
  })
)

it.effect('remove deletes, invalidates, and reports unknown ids', () =>
  Effect.gen(function* () {
    const rows: Array<User> = [{ ...ada }]
    const repo = Layer.succeed(
      UserRepository,
      UserRepository.of({
        list: () => Effect.succeed(rows),
        find: (id) => Effect.succeed(rows.find((row) => row.id === id.toString())),
        findByEmail: (email) => Effect.succeed(rows.find((row) => row.email === email)),
        create: () => Effect.die('covered by the create test'),
        update: () => Effect.die('covered by the merge test'),
        remove: (id) => {
          const index = rows.findIndex((row) => row.id === id.toString())
          if (index < 0) return Effect.succeed(false)
          rows.splice(index, 1)
          return Effect.succeed(true)
        }
      })
    )
    const service = yield* UserService.pipe(
      Effect.provide(
        UserServiceLayer.pipe(
          Layer.provide(Layer.mergeAll(repo, UserCache.layer).pipe(Layer.provide(repo))),
          Layer.provide(testConfig)
        )
      )
    )
    const userId = parseUserId(ada.id)

    yield* service.find(userId)
    expect(yield* service.remove(userId)).toBe(true)
    expect(rows).toHaveLength(0)

    const after = yield* service.find(userId)
    expect(after.user).toBeUndefined()
    expect(yield* service.remove(userId)).toBe(false)
  })
)
