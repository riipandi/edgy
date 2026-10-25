import { Effect } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrateDown, migrationStatus } from '#/database/migrator.ts'
import { confirmDestructive, reporter } from './helper.ts'

export const migrateDownCmd = Command.make(
  'migrate:down',
  {
    count: Flag.Int('count').pipe(
      Flag.withDescription('Number of migrations to roll back'),
      Flag.withDefault(1)
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription(
        'List the migrations that would be rolled back without changing anything'
      ),
      Flag.withDefault(false)
    ),
    force: Flag.Boolean('force').pipe(
      Flag.withDescription('Skip the confirmation prompt'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    config.count < 1
      ? Effect.fail(
          new CliError.UserError({
            cause: '--count must be at least 1',
            userMessage: '--count must be at least 1'
          })
        )
      : Effect.gen(function* () {
          const report = yield* reporter
          const migrations = yield* migrationStatus
          const executed = migrations.filter((migration) => migration.executedAt !== undefined)
          const rollback = executed.slice(-config.count).reverse()

          if (rollback.length === 0) {
            yield* report.ok('No executed migrations to roll back')
            return
          }

          if (config.dryRun) {
            yield* report.warn(`${rollback.length} migration(s) would be rolled back (dry run):`)
            for (const migration of rollback)
              yield* report.warn(`  Would rollback ${migration.name}`)
            return
          }

          const confirmed = yield* confirmDestructive(
            config.force,
            `Roll back ${rollback.length} migration(s)?`,
            'non-interactive session: pass --force to skip the confirmation prompt'
          )
          if (!confirmed) return

          yield* report.start(`Rolling back ${rollback.length} migration(s)`)
          const results = yield* migrateDown(
            executed.map((migration) => migration.name),
            config.count
          )
          if (results.length === 0) {
            yield* report.ok('No executed migrations left to roll back')
            return
          }
          for (const item of results) yield* report.ok(`  Rolled back ${item.migrationName}`)
        }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Rollback database migrations'))
