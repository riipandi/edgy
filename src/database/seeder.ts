import { Effect } from 'effect'
import type { DatabaseError } from '../httputils/errors.ts'
import type { DatabaseService } from './runtime.ts'
import { seedUsers } from './seeders/user_factory.ts'

/**
 * Runs all seeders in order. Each seeder is expected to be idempotent so that
 * repeated runs are safe.
 */
export const runSeeders: Effect.Effect<void, DatabaseError, DatabaseService> = Effect.gen(
  function* () {
    yield* seedUsers
  }
)
