import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vite-plus/test'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { makeDatabaseService, Database } from './adapter.ts'
import { openTursoDatabase } from './dialect.ts'
import { migrateToLatest } from './migrator.ts'
import { runSeeders, SEEDERS } from './seeder.ts'
import { USER_SEED_COUNT } from './seeders/user_factory.ts'

const serviceFor = (name: string, migrate: boolean) =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.tryPromise(() => openTursoDatabase({ kind: 'local', path: testDatabasePath(name) })),
      (database) => Effect.promise(() => database.destroy())
    )
    const service = makeDatabaseService(db)
    if (migrate) yield* Effect.provideService(migrateToLatest, Database, service)
    return service
  })

const userCount = Database.use(({ read }) =>
  read((db) => db.selectFrom('users').select('email').execute())
)

it('registers the users seeder with its record count', () => {
  expect(SEEDERS.map((seeder) => seeder.name)).toEqual(['users'])
  expect(SEEDERS[0]?.records).toBe(USER_SEED_COUNT)
})

it.effect('seeds a migrated schema and stays idempotent', () =>
  Effect.gen(function* () {
    const service = yield* serviceFor('seeder-happy.db', true)

    yield* Effect.provideService(runSeeders, Database, service)
    const first = yield* Effect.provideService(userCount, Database, service)
    expect(first).toHaveLength(USER_SEED_COUNT)

    yield* Effect.provideService(runSeeders, Database, service)
    const second = yield* Effect.provideService(userCount, Database, service)
    expect(second).toHaveLength(USER_SEED_COUNT)
  })
)

it.effect('wraps a failing seeder run in a SeederError', () =>
  Effect.gen(function* () {
    // No migration has created the users table yet, so the seeder's first
    // query fails and the error must surface as a SeederError.
    const service = yield* serviceFor('seeder-unmigrated.db', false)
    const failure = yield* Effect.flip(Effect.provideService(runSeeders, Database, service))
    expect(failure._tag).toBe('SeederError')
    expect(failure.message).toContain('no such table')
  })
)
