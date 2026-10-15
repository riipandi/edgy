import { Effect } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { getMigrationInfos, migrateDown } from '../database/migrator.ts'
import { DatabaseLayer } from '../runtime.ts'
import { confirmDestructive, print } from './helper.ts'

/** `migrate:down` — roll back executed database migrations. */
export const migrateDownCmd = Command.make(
  'migrate:down',
  {
    count: Flag.Int('count').pipe(
      Flag.withDefault(1),
      Flag.withDescription('Number of migrations to roll back')
    ),
    'dry-run': Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'List the migrations that would be rolled back without changing anything'
      )
    ),
    force: Flag.Boolean('force').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Skip the confirmation prompt')
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config.count < 1) {
        yield* Effect.fail(
          new CliError.UserError({
            cause: 'count must be at least 1',
            userMessage: 'The --count flag must be at least 1'
          })
        )
      }

      if (config['dry-run']) {
        const infos = yield* getMigrationInfos
        const executed = infos.filter((info) => info.executedAt !== undefined)
        const affected = executed.slice(Math.max(0, executed.length - config.count))
        if (affected.length === 0) {
          yield* print('Nothing to roll back')
          return
        }
        yield* print(`${affected.length} migration(s) would be rolled back (dry run):`)
        for (const info of affected.toReversed()) {
          yield* print(`  ${info.name}`)
        }
        return
      }

      const proceed = yield* confirmDestructive(
        config.force,
        `Roll back ${config.count} migration(s)?`
      )
      if (!proceed) return

      const results = yield* migrateDown(config.count)
      if (results.length === 0) {
        yield* print('Nothing to roll back')
        return
      }
      for (const result of results) {
        yield* print(`${result.status}: ${result.migrationName}`)
      }
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Rollback database migrations'))
