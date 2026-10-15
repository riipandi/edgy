import { Context, Effect, Layer } from 'effect'
import { DatabaseService, isUniqueViolation } from '../database/service.ts'
import { Conflict, type DatabaseError } from '../kernel/errors.ts'
import { makePage, type Page, type PageRequest } from '../kernel/pagination.ts'
import type { User, UserCreateRequest, UserSortKey } from '../schemas/user_schema.ts'

/**
 * Persistence port for users. The service layer depends on this key, never on
 * Kysely, so a test can swap in an in-memory implementation.
 */
export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Finds one user by primary key, or `undefined` when absent. */
    readonly findById: (id: number) => Effect.Effect<User | undefined, DatabaseError>
    /** Returns one page of users in the requested order, with the total across all pages. */
    readonly findPage: (
      request: PageRequest<UserSortKey>
    ) => Effect.Effect<Page<User>, DatabaseError>
    /** Inserts a user and returns the stored row; fails with `Conflict` on a duplicate email. */
    readonly insert: (input: UserCreateRequest) => Effect.Effect<User, Conflict | DatabaseError>
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
        findPage: Effect.fn('UserRepository.findPage')((request: PageRequest<UserSortKey>) =>
          query(async (db) => {
            // Two statements, not one transaction: a write between them can skew
            // `total` by a row, which a listing tolerates.
            const { total } = await db
              .selectFrom('users')
              .select((eb) => eb.fn.countAll<number>().as('total'))
              .executeTakeFirstOrThrow()

            // `id` last makes the order total, so a page boundary never splits ties.
            let rows = db
              .selectFrom('users')
              .selectAll()
              .orderBy(request.sortBy, request.sortOrder)
              .orderBy('id')
            if (request.limit !== null) rows = rows.limit(request.limit).offset(request.offset)

            return makePage(await rows.execute(), request, total)
          })
        ),
        insert: Effect.fn('UserRepository.insert')((input: UserCreateRequest) =>
          query((db) =>
            db
              .insertInto('users')
              .values({ email: input.email, name: input.name ?? null })
              .returningAll()
              .executeTakeFirstOrThrow()
          ).pipe(
            Effect.catchTag('DatabaseError', (error) =>
              Effect.fail(isUniqueViolation(error) ? new Conflict({ resource: 'User' }) : error)
            )
          )
        )
      })
    })
  )
}
