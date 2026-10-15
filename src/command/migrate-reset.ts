import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { NO_MIGRATIONS } from 'kysely/migration'
import { getMigrationInfos, migrateTo, migrateToLatest } from '../database/migrator.ts'
import { runSeeders, seederNames } from '../database/seeder.ts'
import { DatabaseService } from '../database/service.ts'
import { confirmDestructive, ensure, print } from './helper.ts'

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
      yield* ensure(!config.seed || config.up, 'The --seed flag requires --up')

      if (config['dry-run']) {
        const infos = yield* getMigrationInfos
        const executed = infos.filter((info) => info.executedAt !== undefined)
        if (executed.length === 0) {
          yield* print('Nothing to roll back')
          return
        }
        yield* print(`${executed.length} migration(s) would be rolled back (dry run):`)
        for (const info of executed.toReversed()) {
          yield* print(`  ${info.name}`)
        }
        if (config.up) {
          yield* print(`Then ${infos.length} migration(s) would be re-applied`)
        }
        if (config.seed) {
          yield* print(`Then these seeders would run: ${seederNames.join(', ')}`)
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
      yield* print(`Rolled back ${downResults.length} migration(s)`)

      if (config.up) {
        const upResults = yield* migrateToLatest
        yield* print(`Re-applied ${upResults.length} migration(s)`)
      }

      if (config.seed) {
        yield* print('Running seeders...')
        yield* runSeeders
        yield* print('Seeders completed')
      }
    })
).pipe(Command.provide(DatabaseService.layer), Command.withDescription('Rollback all migrations'))
