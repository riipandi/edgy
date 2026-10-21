import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { layer as databaseLayer } from '#/database/layer.ts'
import { migrationStatus } from '#/database/migrator.ts'
import { Database } from '#/database/service.ts'

export const migrateStatus = Command.make('migrate:status').pipe(
  Command.withDescription('Show Kysely migration status'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const db = yield* Database
      const migrations = yield* Effect.promise(() => migrationStatus(db))
      if (migrations.length === 0) {
        yield* Effect.logInfo('no migrations')
        return
      }
      for (const migration of migrations) {
        const at =
          migration.executedAt === undefined ? 'pending' : migration.executedAt.toISOString()
        yield* Effect.logInfo(`${migration.name} ${at}`)
      }
    }).pipe(Effect.provide(databaseLayer))
  )
)
