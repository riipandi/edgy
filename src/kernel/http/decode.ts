import { Effect, Schema } from 'effect'
import { ValidationError } from '../errors.ts'

/**
 * Decodes untrusted input (a parsed body, router params) with a schema. A failure travels the
 * typed error channel as a `ValidationError`, so no exception crosses the h3 boundary.
 */
export const decode =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (input: unknown): Effect.Effect<A, ValidationError> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((schemaError) => new ValidationError({ schemaError }))
    )
