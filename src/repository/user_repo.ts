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
            // The total rides along as a scalar subquery: SQLite evaluates it once
            // per statement, and one statement is one consistent snapshot, so the
            // page and its count cannot disagree. It also saves a round trip. The
            // extra `total` column is stripped when the response is encoded.
            let rows = db
              .selectFrom('users')
              .selectAll()
              .select((eb) =>
                eb
                  .selectFrom('users')
                  .select((count) => count.fn.countAll<number>().as('count'))
                  .as('total')
              )
              .orderBy(request.sortBy, request.sortOrder)
            // `id` last makes the order total, so a page boundary never splits ties.
            if (request.sortBy !== 'id') rows = rows.orderBy('id')
            if (request.limit !== null) rows = rows.limit(request.limit).offset(request.offset)

            const items = await rows.execute()

            // An empty page has no row to read the total from: the first page means
            // the table is empty, a later one needs a count of its own.
            const total =
              items[0]?.total ??
              (request.offset === 0
                ? 0
                : (
                    await db
                      .selectFrom('users')
                      .select((eb) => eb.fn.countAll<number>().as('total'))
                      .executeTakeFirstOrThrow()
                  ).total)

            return makePage(items, request, total)
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
