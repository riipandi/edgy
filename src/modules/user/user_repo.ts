import { Context, Data, Effect } from 'effect'
import type { User } from '#/database/schema.ts'

export class UserRepositoryError extends Data.TaggedError('UserRepositoryError')<{
  readonly cause: unknown
}> {}

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: () => Effect.Effect<readonly User[], UserRepositoryError>
    readonly find: (id: string) => Effect.Effect<User | undefined, UserRepositoryError>
  }
>()('UserRepository') {}
