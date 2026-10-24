import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrationStatus } from '#/database/migrator.ts'

export const migrateStatusCmd = Command.make('migrate:status').pipe(
  Command.withDescription('Check database migration status'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const migrations = yield* migrationStatus
      if (migrations.length === 0) {
        yield* Effect.logInfo('No migrations')
        return
      }
      for (const migration of migrations) {
        const at =
          migration.executedAt === undefined ? 'pending' : migration.executedAt.toISOString()
        yield* Effect.logInfo(`${migration.name} ${at}`)
      }
    }).pipe(Effect.provide(DatabaseLayer))
  )
)
