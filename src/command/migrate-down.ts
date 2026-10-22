import { Effect } from 'effect'
import { CliError, Command, Flag, Prompt } from 'effect/cli'
import { layer as databaseLayer } from '#/database/layer.ts'
import { migrateDownStep, migrationStatus } from '#/database/migrator.ts'
import { Database } from '#/database/service.ts'

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
          const { db } = yield* Database
          const migrations = yield* Effect.promise(() => migrationStatus(db))
          const executed = migrations.filter((migration) => migration.executedAt !== undefined)
          const rollback = executed.slice(-config.count).reverse()

          if (rollback.length === 0) {
            yield* Effect.logInfo('no executed migrations to roll back')
            return
          }

          if (config.dryRun) {
            for (const migration of rollback)
              yield* Effect.logInfo(`would rollback ${migration.name}`)
            return
          }

          if (!config.force) {
            if (!process.stdin.isTTY)
              return yield* Effect.fail(
                new Error('non-interactive session: pass --force to skip the confirmation prompt')
              )
            const confirmed = yield* Prompt.Confirm({
              message: `Roll back ${rollback.length} migration(s)?`,
              initial: false
            })
            if (!confirmed) return
          }

          for (let i = 0; i < rollback.length; i++) {
            const result = yield* Effect.promise(() => migrateDownStep(db))
            if (result.error !== undefined)
              return yield* Effect.fail(new Error('rollback failed', { cause: result.error }))
            if ((result.results ?? []).length === 0) {
              yield* Effect.logInfo('no executed migrations left to roll back')
              return
            }
            for (const item of result.results ?? [])
              yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
          }
        }).pipe(Effect.provide(databaseLayer))
).pipe(Command.withDescription('Rollback database migrations'))
