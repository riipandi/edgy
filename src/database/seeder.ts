import { Effect } from 'effect'
import type { DatabaseError } from '../kernel/errors.ts'
import { seedUsers } from './seeders/user_factory.ts'
import type { DatabaseService } from './service.ts'

export interface Seeder {
  /** Registry name shown by `migrate:seed --dry-run` and `migrate:status`. */
  readonly name: string
  /** The seeding program. Expected to be idempotent so repeated runs are safe. */
  readonly run: Effect.Effect<void, DatabaseError, DatabaseService>
}

/**
 * Seeder registry, executed top to bottom. New seeders are added here instead
 * of being discovered from disk so they survive bundling into a single file.
 */
export const seeders: ReadonlyArray<Seeder> = [{ name: 'user_factory', run: seedUsers }]

/** Names of every registered seeder, in execution order. */
export const seederNames: ReadonlyArray<string> = seeders.map((seeder) => seeder.name)

/**
 * Runs all seeders in order. Each seeder is expected to be idempotent so that
 * repeated runs are safe.
 */
export const runSeeders: Effect.Effect<void, DatabaseError, DatabaseService> = Effect.gen(
  function* () {
    for (const seeder of seeders) {
      yield* seeder.run
    }
  }
)
