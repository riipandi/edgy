import { Context, Effect, Layer } from 'effect'
import { DatabaseService, isUniqueViolation } from '../../database/service.ts'
import { Conflict, type DatabaseError } from '../../kernel/errors.ts'
import { makePage, type Page, type PageRequest } from '../../kernel/pagination.ts'
import { type User, type UserCreateRequest, UserId, type UserSortKey } from './user_schema.ts'

/** Persistence port for users. The service depends on this key, never on Kysely. */
export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Finds one user by primary key, or `undefined` when absent. */
    readonly findById: (id: string) => Effect.Effect<User | undefined, DatabaseError>
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
      const { query, read } = yield* DatabaseService

      return UserRepository.of({
        findById: Effect.fn('UserRepository.findById')((id: string) =>
          read((db) => db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst())
        ),
        findPage: Effect.fn('UserRepository.findPage')((request: PageRequest<UserSortKey>) =>
          read(async (db) => {
            // The total is a scalar subquery in the same statement, so the page and its count come from one
            // snapshot and cannot disagree. The extra `total` column is stripped when the response is encoded.
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

            // An empty page has no row to read the total from. On the first page that means an empty table;
            // a later page needs its own count.
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
              .values({ id: UserId.make(), email: input.email, name: input.name })
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
