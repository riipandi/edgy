import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { layer as databaseLayer } from '#/database/layer.ts'
import { runSeeders, SEEDERS } from '#/database/seeders/index.ts'
import { Database } from '#/database/service.ts'

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
      const { db } = yield* Database

      if (config.dryRun) {
        for (const seeder of SEEDERS)
          yield* Effect.logInfo(`would seed ${seeder.name} (${seeder.records} records)`)
        return
      }

      yield* Effect.promise(() => runSeeders(db))
      for (const seeder of SEEDERS) yield* Effect.logInfo(`seeded ${seeder.name}`)
    }).pipe(Effect.provide(databaseLayer))
).pipe(Command.withDescription('Seed the database with initial data'))
