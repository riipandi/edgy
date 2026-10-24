import { Effect, Layer } from 'effect'
import { Database, DatabaseError, makeDatabaseService } from '#/database/adapter.ts'
import { openTursoDatabase } from '#/database/dialect/turso.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { testDatabasePath } from './database-url.ts'

// A migrated database file whose ping the health tests override: the
// rate-limit counter keeps its real query path.
const migratedService = Effect.gen(function* () {
  const db = yield* Effect.tryPromise({
    try: () => openTursoDatabase({ kind: 'embedded', path: testDatabasePath('fixtures.db') }),
    catch: (cause) => new DatabaseError({ cause })
  })
  const service = makeDatabaseService(db)
  yield* migrateToLatest.pipe(Effect.provideService(Database, service))
  return service
})

export const migratedDatabase = Layer.effect(Database, migratedService)

export const readyService = Layer.effect(
  Database,
  Effect.map(migratedService, (service) => Database.of({ ...service, ping: Effect.void }))
)

export const unavailableService = Layer.effect(
  Database,
  Effect.map(migratedService, (service) =>
    Database.of({
      ...service,
      ping: Effect.fail(new DatabaseError({ cause: new Error('offline') }))
    })
  )
)

// Ping answers, queries fail: the rate-limit store is unreadable while the
// process itself is healthy — the composition that must keep /api/live green.
export const unwritableStoreService = Layer.effect(
  Database,
  Effect.map(migratedService, (service) =>
    Database.of({
      ...service,
      query: () => Effect.fail(new DatabaseError({ cause: new Error('store unavailable') })),
      read: () => Effect.fail(new DatabaseError({ cause: new Error('store unavailable') }))
    })
  )
)
