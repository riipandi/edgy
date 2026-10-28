import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { expect } from 'vite-plus/test'
import { migratedDatabaseFor } from '../../../../tests/fixtures/database.ts'
import { UserRepository, UserRepositoryLayer, UserEmailConflict } from './user_repo.ts'
import { defineUserId } from './user_schema.ts'

const ada = { email: 'ada@example.com', name: 'Ada Lovelace', avatar_url: null }

it.effect('create maps a unique-email violation to UserEmailConflict', () =>
  Effect.gen(function* () {
    const repo = yield* UserRepository.pipe(
      Effect.provide(
        UserRepositoryLayer.pipe(Layer.provide(migratedDatabaseFor('user-repo-conflict-create.db')))
      )
    )
    yield* repo.create(defineUserId(), ada)
    const conflict = yield* Effect.flip(repo.create(defineUserId(), ada))
    expect(conflict._tag).toBe('UserEmailConflict')
    expect((conflict as UserEmailConflict).email).toBe('ada@example.com')
  })
)

it.effect('update maps a unique-email violation to UserEmailConflict', () =>
  Effect.gen(function* () {
    const repo = yield* UserRepository.pipe(
      Effect.provide(
        UserRepositoryLayer.pipe(Layer.provide(migratedDatabaseFor('user-repo-conflict-update.db')))
      )
    )
    const graceId = defineUserId()
    yield* repo.create(defineUserId(), ada)
    yield* repo.create(graceId, { ...ada, email: 'grace@example.com', name: 'Grace Hopper' })
    const conflict = yield* Effect.flip(repo.update(graceId, { email: 'ada@example.com' }))
    expect(conflict._tag).toBe('UserEmailConflict')
    expect((conflict as UserEmailConflict).email).toBe('ada@example.com')
  })
)
