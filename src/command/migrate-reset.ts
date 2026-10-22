import { Effect } from 'effect'
import { Command, Flag, Prompt } from 'effect/cli'
import { DatabaseLayer } from '#/database/layer.ts'
import { MIGRATION_COUNT } from '#/database/migrations/index.ts'
import { migrationStatus, migrateToLatest, migrateToNoMigrations } from '#/database/migrator.ts'
import { runSeeders } from '#/database/seeders/index.ts'
import { Database } from '#/database/service.ts'

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
      if (config.seed && !config.up) return yield* Effect.fail(new Error('--seed requires --up'))

      const { db } = yield* Database
      const migrations = yield* Effect.promise(() => migrationStatus(db))
      const executed = migrations
        .filter((migration) => migration.executedAt !== undefined)
        .reverse()

      if (config.dryRun) {
        if (executed.length === 0) yield* Effect.logInfo('no executed migrations to roll back')
        for (const migration of executed) yield* Effect.logInfo(`would rollback ${migration.name}`)
        if (config.up) yield* Effect.logInfo(`would re-apply ${MIGRATION_COUNT} migrations`)
        return
      }

      if (executed.length === 0) yield* Effect.logInfo('no executed migrations to roll back')
      if (!config.up && executed.length === 0) return

      if (executed.length > 0) {
        if (!config.force) {
          if (!process.stdin.isTTY)
            return yield* Effect.fail(
              new Error('non-interactive session: pass --force to skip the confirmation prompt')
            )
          const message = config.up
            ? `Roll back ${executed.length} migration(s) and re-apply the full schema?`
            : `Roll back all ${executed.length} migration(s)?`
          const confirmed = yield* Prompt.Confirm({ message, initial: false })
          if (!confirmed) return
        }

        const downResult = yield* Effect.promise(() => migrateToNoMigrations(db))
        if (downResult.error !== undefined)
          return yield* Effect.fail(new Error('rollback failed', { cause: downResult.error }))
        for (const item of downResult.results ?? [])
          yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
      }

      if (!config.up) return

      const upResult = yield* Effect.promise(() => migrateToLatest(db))
      if (upResult.error !== undefined)
        return yield* Effect.fail(new Error('migration failed', { cause: upResult.error }))
      for (const item of upResult.results ?? [])
        yield* Effect.logInfo(`${item.status} ${item.migrationName}`)

      if (config.seed) {
        yield* Effect.promise(() => runSeeders(db))
        yield* Effect.logInfo('seeders applied')
      }
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Rollback all migrations'))
