import { UserId } from '../src/modules/user/user_schema.ts'

/** A well-formed `user_` id that no test ever inserts: looking it up is a clean `404`. */
export const MISSING_USER_ID = 'user_00000000000000000000000000'

/** A row for `insertInto('users')`; ids are minted by the application, so a test mints one too. */
export const userRow = (email: string, name = 'Test User') => ({
  id: UserId.make(),
  email,
  name
})
