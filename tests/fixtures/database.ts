import { Effect, Layer } from 'effect'
import { Database, DatabaseError, makeDatabaseService } from '#/database/adapter.ts'
import { openTursoDatabase } from '#/database/dialect.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { testDatabasePath } from './database-url.ts'

// A migrated database file whose ping the health tests override: the
// rate-limit counter keeps its real query path. Each name is its own file,
// so suites that own limiter state (rate limiting) can start from an empty
// counter instead of sharing the bucket other files keep bumping.
const migratedService = (name: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.tryPromise({
      try: () => openTursoDatabase({ kind: 'local', path: testDatabasePath(name) }),
      catch: (cause) => new DatabaseError({ cause })
    })
    const service = makeDatabaseService(db)
    yield* migrateToLatest.pipe(Effect.provideService(Database, service))
    return service
  })

export const migratedDatabaseFor = (name: string) => Layer.effect(Database, migratedService(name))

export const migratedDatabase = migratedDatabaseFor('fixtures.db')

export const readyService = Layer.effect(
  Database,
  Effect.map(migratedService('fixtures.db'), (service) =>
    Database.of({ ...service, ping: Effect.void })
  )
)

export const unavailableService = Layer.effect(
  Database,
  Effect.map(migratedService('fixtures.db'), (service) =>
    Database.of({
      ...service,
      ping: Effect.fail(new DatabaseError({ cause: new Error('offline') }))
    })
  )
)

// Ping answers, queries fail: the rate-limit store is unreadable while
// the readiness ping itself still answers.
export const unwritableStoreService = Layer.effect(
  Database,
  Effect.map(migratedService('fixtures.db'), (service) =>
    Database.of({
      ...service,
      query: () => Effect.fail(new DatabaseError({ cause: new Error('store unavailable') })),
      read: () => Effect.fail(new DatabaseError({ cause: new Error('store unavailable') }))
    })
  )
)
