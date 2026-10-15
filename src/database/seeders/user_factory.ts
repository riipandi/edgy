import { Effect } from 'effect'
import type { DatabaseError } from '../../kernel/errors.ts'
import type { UsersTable } from '../../modules/user/user_schema.ts'
import { DatabaseService } from '../service.ts'

const SAMPLE_USERS: ReadonlyArray<Pick<UsersTable, 'email' | 'name'>> = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'grace@example.com', name: 'Grace Hopper' },
  { email: 'linus@example.com', name: 'Linus Torvalds' }
]

/**
 * Inserts a deterministic set of sample users.
 *
 * Idempotent: rows whose `email` already exists are skipped.
 */
export const seedUsers: Effect.Effect<void, DatabaseError, DatabaseService> = DatabaseService.use(
  ({ query }) =>
    query(async (db) => {
      for (const user of SAMPLE_USERS) {
        await db
          .insertInto('users')
          .values(user)
          .onConflict((oc) => oc.column('email').doNothing())
          .execute()
      }
    })
)
