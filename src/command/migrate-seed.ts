import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { runSeeders, seederNames } from '../database/seeder.ts'
import { DatabaseLayer } from '../runtime.ts'
import { print } from './helper.ts'

/** `migrate:seed` — seed the database with initial data. */
export const migrateSeedCmd = Command.make(
  'migrate:seed',
  {
    'dry-run': Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Report what would be seeded without changing anything')
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config['dry-run']) {
        yield* print('Seeders that would run (dry run, nothing seeded):')
        for (const name of seederNames) {
          yield* print(`  ${name}`)
        }
        return
      }

      yield* runSeeders
      yield* print('Seeders completed')
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Seed the database with initial data'))
