import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { runSeeders, SEEDERS } from '#/database/seeder.ts'

export const migrateSeedCmd = Command.make(
  'migrate:seed',
  {
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('Report what would be seeded without changing anything'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config.dryRun) {
        for (const seeder of SEEDERS)
          yield* Effect.logInfo(`Would seed ${seeder.name} (${seeder.records} records)`)
        return
      }

      yield* runSeeders
      for (const seeder of SEEDERS) yield* Effect.logInfo(`Seeded ${seeder.name}`)
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Seed the database with initial data'))
