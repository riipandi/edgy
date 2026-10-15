import { UserId } from '../src/modules/user/user_schema.ts'

/** A well-formed `user_` id that no test inserts, so a lookup returns a clean 404. */
export const MISSING_USER_ID = 'user_00000000000000000000000000'

/** A row for `insertInto('users')`. The application mints ids, so tests mint them too. */
export const userRow = (email: string, name = 'Test User') => ({
  id: UserId.make(),
  email,
  name
})
