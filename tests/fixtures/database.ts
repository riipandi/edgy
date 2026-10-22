import { Effect, Layer } from 'effect'
import { Database, DatabaseError, makeDatabaseService } from '#/database/adapter.ts'
import { openDatabase } from '#/database/dialect/sqlite.ts'
import { migrateToLatest } from '#/database/migrator.ts'

// A migrated in-memory database whose ping the health tests override: the
// rate-limit counter keeps its real query path.
const migratedService = Effect.gen(function* () {
  const db = openDatabase(':memory:')
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
