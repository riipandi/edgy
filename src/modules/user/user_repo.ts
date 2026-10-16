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
    /** Returns one page of users in the requested order, and the cursor of the next. */
    readonly findPage: (
      request: PageRequest<UserSortKey>
    ) => Effect.Effect<Page<User>, DatabaseError>
    /**
     * Inserts a user and returns the stored row; fails with `Conflict` on a duplicate email. The
     * email is stored lowercase, so two spellings of one address are one user.
     */
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
            const { sortBy, sortOrder, after, limit } = request
            let rows = db.selectFrom('users').selectAll()
            // Keyset: start just after the anchor in (sort value, id) order. `id` breaks ties in the
            // same direction as the sort, so one row-value comparison covers both columns.
            if (after !== undefined) {
              const operator = sortOrder === 'asc' ? '>' : '<'
              rows =
                sortBy === 'id'
                  ? rows.where('id', operator, after.id)
                  : rows.where((eb) =>
                      eb(
                        eb.refTuple(sortBy, 'id'),
                        operator,
                        eb.tuple(String(after.value), after.id)
                      )
                    )
            }
            rows = rows.orderBy(sortBy, sortOrder)
            if (sortBy !== 'id') rows = rows.orderBy('id', sortOrder)

            // One extra row says whether another page follows, without counting the table.
            return makePage(await rows.limit(limit + 1).execute(), request)
          })
        ),
        insert: Effect.fn('UserRepository.insert')((input: UserCreateRequest) =>
          query((db) =>
            db
              .insertInto('users')
              .values({ id: UserId.make(), email: input.email.toLowerCase(), name: input.name })
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
