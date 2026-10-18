import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { layer as databaseLayer } from '../database/layer.ts'
import { migrateAndSeed } from '../database/migrator.ts'
import { Database } from '../database/service.ts'

export const migrateUp = Command.make('migrate:up').pipe(
  Command.withDescription('Apply Kysely migrations and seed users'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const db = yield* Database
      const result = yield* Effect.promise(() => migrateAndSeed(db))
      if (result.error !== undefined)
        return yield* Effect.fail(new Error('migration failed', { cause: result.error }))
      for (const item of result.results ?? []) {
        yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
      }
      yield* Effect.logInfo('users seeded')
    }).pipe(Effect.provide(databaseLayer))
  )
)
