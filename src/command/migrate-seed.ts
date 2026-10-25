import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { runSeeders, SEEDERS } from '#/database/seeder.ts'
import { reporter } from './helper.ts'

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
      const report = yield* reporter
      if (config.dryRun) {
        yield* report.warn(`${SEEDERS.length} seeder(s) would run (dry run):`)
        for (const seeder of SEEDERS)
          yield* report.warn(`  Would seed ${seeder.name} (${seeder.records} records)`)
        return
      }

      for (const seeder of SEEDERS) yield* report.start(`Seeding ${seeder.name}`)
      yield* runSeeders
      for (const seeder of SEEDERS)
        yield* report.ok(`  Seeded ${seeder.name} (${seeder.records} records)`)
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Seed the database with initial data'))
