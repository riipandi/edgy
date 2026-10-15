import { Context, Effect, Layer } from 'effect'
import { DatabaseService } from '../database/service.ts'
import type { CreateUserInput } from '../httputils/validator.ts'
import type { DatabaseError } from '../kernel/errors.ts'
import type { UserRow } from '../schemas/user_schema.ts'

/**
 * Persistence port for users. The service layer depends on this key, never on
 * Kysely, so a test can swap in an in-memory implementation.
 */
export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Finds one user by primary key, or `undefined` when absent. */
    readonly findById: (id: number) => Effect.Effect<UserRow | undefined, DatabaseError>
    /** Lists every user ordered by id. */
    readonly findAll: Effect.Effect<Array<UserRow>, DatabaseError>
    /** Inserts a user and returns the stored row. */
    readonly insert: (input: CreateUserInput) => Effect.Effect<UserRow, DatabaseError>
  }
>()('UserRepository') {
  static readonly layer: Layer.Layer<UserRepository, never, DatabaseService> = Layer.effect(
    UserRepository,
    Effect.gen(function* () {
      const { query } = yield* DatabaseService

      return UserRepository.of({
        findById: Effect.fn('UserRepository.findById')((id: number) =>
          query((db) => db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst())
        ),
        findAll: query((db) => db.selectFrom('users').selectAll().orderBy('id').execute()),
        insert: Effect.fn('UserRepository.insert')((input: CreateUserInput) =>
          query((db) =>
            db
              .insertInto('users')
              .values({ email: input.email, name: input.name ?? null })
              .returningAll()
              .executeTakeFirstOrThrow()
          )
        )
      })
    })
  )
}
