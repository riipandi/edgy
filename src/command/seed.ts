import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { runSeeders } from '../database/seeder.ts'
import { DatabaseLayer } from '../runtime.ts'

/** `seed` — populate the database with sample data. */
export const seedCmd = Command.make('seed', {}, () =>
  runSeeders.pipe(
    Effect.tap(() => Effect.logInfo('Seeders completed')),
    Effect.provide(DatabaseLayer)
  )
).pipe(Command.withDescription('Seed the database with sample data'))
