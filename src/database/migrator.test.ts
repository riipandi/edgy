import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vite-plus/test'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { makeDatabaseService, Database } from './adapter.ts'
import { openTursoDatabase } from './dialect.ts'
import { MIGRATION_COUNT, MIGRATION_NAMES } from './migrations/index.ts'
import { migrateAndSeed, migrateDown, migrateToLatest, migrationStatus } from './migrator.ts'
import { USER_SEED_COUNT } from './seeders/user_factory.ts'

/** A fresh throwaway database held for the whole test, wrapped as the service. */
const freshService = (name: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.tryPromise(() => openTursoDatabase({ kind: 'local', path: testDatabasePath(name) })),
      (database) => Effect.promise(() => database.destroy())
    )
    return makeDatabaseService(db)
  })

const running = <A, E>(
  effect: Effect.Effect<A, E, Database>,
  service: Awaited<ReturnType<typeof makeDatabaseService>>
) => Effect.provideService(effect, Database, service)

const executedNames = Effect.map(migrationStatus, (migrations) =>
  migrations
    .filter((migration) => migration.executedAt !== undefined)
    .map((migration) => migration.name)
)

it.effect('applies every migration to a fresh schema', () =>
  Effect.gen(function* () {
    const service = yield* freshService('migrator-fresh.db')
    const results = yield* running(migrateToLatest, service)
    expect(results).toHaveLength(MIGRATION_COUNT)

    const status = yield* running(migrationStatus, service)
    expect(status.map((migration) => migration.name)).toEqual(MIGRATION_NAMES)
    expect(status.every((migration) => migration.executedAt !== undefined)).toBe(true)
  })
)

it.effect('rolls back the requested number of executed migrations', () =>
  Effect.gen(function* () {
    const service = yield* freshService('migrator-down.db')
    yield* running(migrateToLatest, service)

    const results = yield* running(migrateDown(MIGRATION_NAMES, 1), service)
    expect(results).toHaveLength(1)

    const executed = yield* running(executedNames, service)
    expect(executed).toEqual(MIGRATION_NAMES.slice(0, -1))
  })
)

it.effect('treats an empty or non-positive rollback as a no-op', () =>
  Effect.gen(function* () {
    const service = yield* freshService('migrator-noop.db')
    yield* running(migrateToLatest, service)

    expect(yield* running(migrateDown([], 2), service)).toEqual([])
    expect(yield* running(migrateDown(MIGRATION_NAMES, 0), service)).toEqual([])

    const executed = yield* running(executedNames, service)
    expect(executed).toEqual(MIGRATION_NAMES)
  })
)

it.effect('rolls back everything when the steps cover every migration', () =>
  Effect.gen(function* () {
    const service = yield* freshService('migrator-all-down.db')
    yield* running(migrateToLatest, service)

    yield* running(migrateDown(MIGRATION_NAMES, MIGRATION_COUNT + 1), service)

    const executed = yield* running(executedNames, service)
    expect(executed).toEqual([])
  })
)

it.effect('migrates and seeds a fresh schema in one run', () =>
  Effect.gen(function* () {
    const service = yield* freshService('migrator-and-seed.db')
    const results = yield* running(migrateAndSeed, service)
    expect(results).toHaveLength(MIGRATION_COUNT)

    const counted = yield* running(
      Database.use(({ read }) => read((db) => db.selectFrom('users').select('email').execute())),
      service
    )
    expect(counted).toHaveLength(USER_SEED_COUNT)
  })
)
