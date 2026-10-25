import { Effect } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { MIGRATION_COUNT } from '#/database/migrations/index.ts'
import { migrationStatus, migrateToLatest, migrateToNoMigrations } from '#/database/migrator.ts'
import { runSeeders, SEEDERS } from '#/database/seeder.ts'
import { confirmDestructive, reporter } from './helper.ts'

export const migrateResetCmd = Command.make(
  'migrate:reset',
  {
    up: Flag.Boolean('up').pipe(
      Flag.withDescription('Re-apply all migrations after the rollback (fresh schema)'),
      Flag.withDefault(false)
    ),
    seed: Flag.Boolean('seed').pipe(
      Flag.withDescription('Run the seeders after the re-apply (requires --up)'),
      Flag.withDefault(false)
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('Print what would be rolled back without changing anything'),
      Flag.withDefault(false)
    ),
    force: Flag.Boolean('force').pipe(
      Flag.withDescription('Skip the confirmation prompt'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    Effect.gen(function* () {
      const report = yield* reporter
      if (config.seed && !config.up)
        return yield* Effect.fail(
          new CliError.UserError({
            cause: '--seed requires --up',
            userMessage: '--seed requires --up'
          })
        )

      const migrations = yield* migrationStatus
      const executed = migrations
        .filter((migration) => migration.executedAt !== undefined)
        .reverse()

      if (config.dryRun) {
        if (executed.length === 0) {
          yield* report.ok('No executed migrations to roll back')
          return
        }
        yield* report.warn(`${executed.length} migration(s) would be rolled back (dry run):`)
        for (const migration of executed) yield* report.warn(`  Would rollback ${migration.name}`)
        if (config.up) yield* report.warn(`Would re-apply ${MIGRATION_COUNT} migrations`)
        return
      }

      if (executed.length === 0) yield* report.ok('No executed migrations to roll back')
      if (!config.up && executed.length === 0) return

      if (executed.length > 0) {
        const message = config.up
          ? `Roll back ${executed.length} migration(s) and re-apply the full schema?`
          : `Roll back all ${executed.length} migration(s)?`
        const confirmed = yield* confirmDestructive(
          config.force,
          message,
          'non-interactive session: pass --force to skip the confirmation prompt'
        )
        if (!confirmed) return

        yield* report.start(`Rolling back ${executed.length} migration(s)`)
        const downResults = yield* migrateToNoMigrations
        for (const item of downResults) yield* report.ok(`Rolled back ${item.migrationName}`)
      }

      if (!config.up) return

      yield* report.space()
      yield* report.start(`Applying ${MIGRATION_COUNT} migration(s)`)
      const upResults = yield* migrateToLatest
      for (const item of upResults) yield* report.ok(`Applied ${item.migrationName}`)

      if (config.seed) {
        yield* report.space()
        for (const seeder of SEEDERS) yield* report.start(`Seeding ${seeder.name}`)
        yield* runSeeders
        for (const seeder of SEEDERS)
          yield* report.ok(`Seeded ${seeder.name} (${seeder.records} records)`)
      }

      yield* report.space()
      yield* report.ok('Reset complete')
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Rollback all migrations'))
