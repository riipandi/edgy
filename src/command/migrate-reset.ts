import { Effect } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { NO_MIGRATIONS } from 'kysely/migration'
import { getMigrationInfos, migrateTo, migrateToLatest } from '../database/migrator.ts'
import { runSeeders, seederNames } from '../database/seeder.ts'
import { DatabaseLayer } from '../runtime.ts'
import { confirmDestructive } from './confirm.ts'

/** `migrate:reset` — roll back every migration, optionally re-apply and seed. */
export const migrateResetCmd = Command.make(
  'migrate:reset',
  {
    up: Flag.Boolean('up').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Re-apply all migrations after the rollback (fresh schema)')
    ),
    seed: Flag.Boolean('seed').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Run the seeders after the re-apply (requires --up)')
    ),
    'dry-run': Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Print what would be rolled back without changing anything')
    ),
    force: Flag.Boolean('force').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Skip the confirmation prompt')
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config.seed && !config.up) {
        yield* Effect.fail(
          new CliError.UserError({
            cause: 'seed requires up',
            userMessage: 'The --seed flag requires --up'
          })
        )
      }

      if (config['dry-run']) {
        const infos = yield* getMigrationInfos
        const executed = infos.filter((info) => info.executedAt !== undefined)
        if (executed.length === 0) {
          yield* Effect.logInfo('Nothing to roll back')
          return
        }
        yield* Effect.logInfo(`${executed.length} migration(s) would be rolled back (dry run):`)
        for (const info of executed.toReversed()) {
          yield* Effect.logInfo(`  ${info.name}`)
        }
        if (config.up) {
          yield* Effect.logInfo(`Then ${infos.length} migration(s) would be re-applied`)
        }
        if (config.seed) {
          yield* Effect.logInfo(`Then these seeders would run: ${seederNames.join(', ')}`)
        }
        return
      }

      const proceed = yield* confirmDestructive(
        config.force,
        config.up
          ? 'Reset the database (roll back and re-apply all migrations)?'
          : 'Roll back ALL migrations?'
      )
      if (!proceed) return

      const downResults = yield* migrateTo(NO_MIGRATIONS)
      yield* Effect.logInfo(`Rolled back ${downResults.length} migration(s)`)

      if (config.up) {
        const upResults = yield* migrateToLatest
        yield* Effect.logInfo(`Re-applied ${upResults.length} migration(s)`)
      }

      if (config.seed) {
        yield* Effect.logInfo('Running seeders...')
        yield* runSeeders
        yield* Effect.logInfo('Seeders completed')
      }
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Rollback all migrations'))
