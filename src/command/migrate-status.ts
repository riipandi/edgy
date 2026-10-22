import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { Database } from '#/database/adapter.ts'
import { migrationStatus, MigratorError } from '#/database/migrator.ts'

export const migrateStatusCmd = Command.make('migrate:status').pipe(
  Command.withDescription('Check database migration status'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const { db } = yield* Database
      const migrations = yield* Effect.tryPromise({
        try: () => migrationStatus(db),
        catch: (cause) => new MigratorError({ cause })
      })
      if (migrations.length === 0) {
        yield* Effect.logInfo('no migrations')
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
