import { Schema } from 'effect'

// --- Request schemas ---

/** JSON body accepted by `POST /users`. */
export const CreateUserInput = Schema.Struct({
  email: Schema.String.pipe(
    Schema.check(
      Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'must be a valid email address' })
    )
  ),
  name: Schema.optional(Schema.String)
})

export type CreateUserInput = typeof CreateUserInput.Type

/** Path param ":id" arrives as string → decode + validate into a positive integer. */
export const UserIdParam = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
)

/**
 * Router params are validated as a whole object, so the schema mirrors the
 * `:id` segment rather than a bare number.
 */
export const UserIdParams = Schema.Struct({ id: UserIdParam })

export type UserIdParams = typeof UserIdParams.Type

// --- Standard Schema V1 views, for h3's validated helpers ---

export const createUserInputStandard = Schema.toStandardSchemaV1(CreateUserInput)
export const userIdParamsStandard = Schema.toStandardSchemaV1(UserIdParams)
