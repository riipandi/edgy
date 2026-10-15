import { Effect, Schema } from 'effect'
import { ValidationError } from '../errors.ts'

/**
 * Decodes untrusted input (a parsed body, router params) with a schema.
 *
 * Validation runs inside the Effect program, so a failure travels the typed
 * error channel as {@link ValidationError} and `runEffect` maps it to a 400
 * with the flattened issue list — no exception thrown across the h3 boundary.
 *
 * The request schemas themselves live next to their entity in `src/schemas/`.
 */
export const decode =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (input: unknown): Effect.Effect<A, ValidationError> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((schemaError) => new ValidationError({ schemaError }))
    )
