import { Effect } from 'effect'
import type { DatabaseError } from '../kernel/errors.ts'
import { seedUsers } from './seeders/user_factory.ts'
import type { DatabaseService } from './service.ts'

export interface Seeder {
  /** Name shown in seed and status output. */
  readonly name: string
  /** Must be idempotent so repeated runs are safe. */
  readonly run: Effect.Effect<void, DatabaseError, DatabaseService>
}

/** Seeders, run in order. Registered here rather than discovered from disk so they survive bundling. */
export const seeders: ReadonlyArray<Seeder> = [{ name: 'user_factory', run: seedUsers }]

export const seederNames: ReadonlyArray<string> = seeders.map((seeder) => seeder.name)

/** Runs every seeder in registry order. */
export const runSeeders: Effect.Effect<void, DatabaseError, DatabaseService> = Effect.gen(
  function* () {
    for (const seeder of seeders) {
      yield* seeder.run
    }
  }
)
