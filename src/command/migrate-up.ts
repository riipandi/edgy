import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { migrateTo, migrateToLatest, migrationStatus } from '#/database/migrator.ts'

export const migrateUpCmd = Command.make(
  'migrate:up',
  {
    to: Flag.String('to').pipe(
      Flag.withDescription('Apply migrations only up to this migration name'),
      Flag.optional
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('List the pending migrations without applying them'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    Effect.gen(function* () {
      const target = Option.getOrUndefined(config.to)
      if (target !== undefined && !MIGRATION_NAMES.includes(target))
        return yield* Effect.fail(new Error(`unknown migration '${target}'`))

      if (config.dryRun) {
        const migrations = yield* migrationStatus
        const pending = migrations.filter((migration) => migration.executedAt === undefined)
        const limit =
          target === undefined ? MIGRATION_NAMES.length : MIGRATION_NAMES.indexOf(target) + 1
        const list = pending.filter((migration) => MIGRATION_NAMES.indexOf(migration.name) < limit)
        if (list.length === 0) yield* Effect.logInfo('no pending migrations')
        for (const migration of list) yield* Effect.logInfo(`pending ${migration.name}`)
        return
      }

      const results = yield* target === undefined ? migrateToLatest : migrateTo(target)
      if (results.length === 0) yield* Effect.logInfo('database is up to date')
      for (const item of results) yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Run database migrations'))
