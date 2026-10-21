import { Effect, Layer } from 'effect'
import { AppConfig } from '#/kernel/config/app-config.ts'
import { openDatabase } from './dialect/sqlite.ts'
import { Database } from './service.ts'

export const layer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* AppConfig
    return yield* Effect.acquireRelease(
      Effect.sync(() => openDatabase(config.databasePath)),
      (db) => Effect.promise(() => db.destroy())
    )
  })
)
