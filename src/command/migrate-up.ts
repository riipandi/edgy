import { Effect, Option } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { MIGRATION_NAMES } from '#/database/migrations/index.ts'
import { migrateTo, migrateToLatest, migrationStatus } from '#/database/migrator.ts'
import { reporter } from './helper.ts'

const userError = (message: string) =>
  Effect.fail(new CliError.UserError({ cause: message, userMessage: message }))

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
      const report = yield* reporter
      const target = Option.getOrUndefined(config.to)
      if (target !== undefined && !MIGRATION_NAMES.includes(target))
        return yield* userError(`unknown migration '${target}'`)

      const migrations = yield* migrationStatus
      const limit =
        target === undefined ? MIGRATION_NAMES.length : MIGRATION_NAMES.indexOf(target) + 1
      const pending = migrations.filter(
        (migration) =>
          migration.executedAt === undefined && MIGRATION_NAMES.indexOf(migration.name) < limit
      )

      // Kysely's `migrateTo` also walks backwards, so an applied target would
      // roll the schema down. This command only ever moves forward.
      if (target !== undefined && !pending.some((migration) => migration.name === target))
        return yield* userError(`migration '${target}' is already applied`)

      if (config.dryRun) {
        if (pending.length === 0) yield* report.ok('No pending migrations')
        else {
          yield* report.warn(`${pending.length} pending migration(s) (dry run):`)
          for (const migration of pending) yield* report.warn(`  Would apply ${migration.name}`)
        }
        return
      }

      if (pending.length > 0) yield* report.start(`Applying ${pending.length} migration(s)`)
      const results = yield* target === undefined ? migrateToLatest : migrateTo(target)
      if (results.length === 0) yield* report.ok('Database is up to date')
      else for (const item of results) yield* report.ok(`  Applied ${item.migrationName}`)
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Run database migrations'))
