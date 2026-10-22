import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { Database } from '#/database/adapter.ts'
import { runSeeders, SeederError, SEEDERS } from '#/database/seeder.ts'

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

      yield* Effect.tryPromise({
        try: () => runSeeders(db),
        catch: (cause) => new SeederError({ cause })
      })
      for (const seeder of SEEDERS) yield* Effect.logInfo(`seeded ${seeder.name}`)
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Seed the database with initial data'))
