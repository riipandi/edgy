import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { migrateToLatest } from '../database/migrator.ts'
import { DatabaseLayer } from '../runtime.ts'

/** `migrate` — apply pending database migrations. */
export const migrateCmd = Command.make('migrate', {}, () =>
  Effect.gen(function* () {
    const results = yield* migrateToLatest
    if (results.length === 0) {
      yield* Effect.logInfo('No pending migrations')
      return
    }
    for (const result of results) {
      yield* Effect.logInfo(`${result.status}: ${result.migrationName}`)
    }
  }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Run pending database migrations'))
