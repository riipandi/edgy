import { Effect, Schema } from 'effect'
import { ValidationError } from '../kernel/errors.ts'

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
const UserIdParam = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
)

/**
 * Router params are validated as a whole object, so the schema mirrors the
 * `:id` segment rather than a bare number.
 */
export const UserIdParams = Schema.Struct({ id: UserIdParam })

export type UserIdParams = typeof UserIdParams.Type

/**
 * Decodes untrusted input (a parsed body, router params) with a schema.
 *
 * Validation runs inside the Effect program, so a failure travels the typed
 * error channel as {@link ValidationError} and `runEffect` maps it to a 400
 * with the flattened issue list — no exception thrown across the h3 boundary.
 */
export const decode =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (input: unknown): Effect.Effect<A, ValidationError> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((schemaError) => new ValidationError({ schemaError }))
    )
