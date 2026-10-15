import { Effect } from 'effect'
import { DatabaseService } from '../database/runtime.ts'
import { DatabaseError } from '../httputils/errors.ts'
import type { CreateUserInput } from '../httputils/validator.ts'

/** Finds one user by primary key, or `undefined` when absent. */
export const findUserById = (id: number) =>
  DatabaseService.use(({ db }) =>
    Effect.tryPromise({
      try: () => db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst(),
      catch: (cause) => new DatabaseError({ cause })
    })
  )

/** Lists every user ordered by id. */
export const findAllUsers = DatabaseService.use(({ db }) =>
  Effect.tryPromise({
    try: () => db.selectFrom('users').selectAll().orderBy('id').execute(),
    catch: (cause) => new DatabaseError({ cause })
  })
)

/** Inserts a user and returns the stored row. */
export const insertUser = (input: CreateUserInput) =>
  DatabaseService.use(({ db }) =>
    Effect.tryPromise({
      try: () =>
        db
          .insertInto('users')
          .values({ email: input.email, name: input.name ?? null })
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) => new DatabaseError({ cause })
    })
  )
