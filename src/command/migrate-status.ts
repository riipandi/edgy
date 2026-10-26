import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrationStatus } from '#/database/migrator.ts'
import { reporter } from './helper.ts'

export const migrateStatusCmd = Command.make('migrate:status').pipe(
  Command.withDescription('Check database migration status'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const report = yield* reporter
      const migrations = yield* migrationStatus
      const executed = migrations.filter((migration) => migration.executedAt !== undefined)
      const pending = migrations.filter((migration) => migration.executedAt === undefined)

      yield* report.ok(`Executed (${executed.length}):`)
      if (executed.length === 0) yield* report.ok('(none)')
      for (const migration of executed)
        yield* report.ok(`${migration.name} ${migration.executedAt?.toISOString()}`)

      yield* report.warn(`Pending (${pending.length}):`)
      if (pending.length === 0) yield* report.warn('(none)')
      for (const migration of pending) yield* report.warn(`${migration.name}`)
    }).pipe(Effect.provide(DatabaseLayer))
  )
)
