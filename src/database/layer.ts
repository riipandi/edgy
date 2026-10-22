import { Effect, Layer } from 'effect'
import { AppConfig } from '#/kernel/config/config.ts'
import { openDatabase } from './dialect/sqlite.ts'
import { Database, makeDatabaseService, makeQueryLogger } from './service.ts'

export const DatabaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const log = yield* makeQueryLogger
    return yield* Effect.acquireRelease(
      Effect.sync(() => openDatabase(config.database.path, log)),
      (database) => Effect.promise(() => database.destroy())
    )
  }).pipe(Effect.map(makeDatabaseService))
)
