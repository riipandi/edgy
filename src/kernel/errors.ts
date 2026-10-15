import { Data, type Duration, Schema, SchemaIssue, type StandardSchema } from 'effect'

/**
 * Domain error: user not found.
 */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly id: number
}> {}

/** Flattened issue shape for API responses. */
export interface ValidationIssue {
  readonly path: ReadonlyArray<PropertyKey | StandardSchema.StandardSchemaV1.PathSegment>
  readonly message: string
}

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/**
 * Validation failure wrapping the Effect v4 `SchemaError`.
 * The structured issue tree is flattened with the default formatter.
 */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly schemaError: Schema.SchemaError
}> {
  override get message(): string {
    return this.schemaError.message
  }

  /** Flattened list of issues for the response body. */
  get issues(): ReadonlyArray<ValidationIssue> {
    return formatIssues(this.schemaError.issue).issues.map((i) => ({
      path: i.path ?? [],
      message: i.message
    }))
  }
}

/**
 * Database failure wrapping a Kysely/SQLite error.
 */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: unknown
}> {}

/**
 * A write violated a uniqueness rule (for example a duplicate email). A client
 * error, unlike {@link DatabaseError}, so it answers 409 instead of 500.
 */
export class Conflict extends Data.TaggedError('Conflict')<{
  readonly resource: string
}> {}

/** The program did not finish within `REQUEST_TIMEOUT`. */
export class RequestTimeout extends Data.TaggedError('RequestTimeout')<{
  readonly after: Duration.Duration
}> {}

export type AppError = NotFound | ValidationError | DatabaseError | Conflict | RequestTimeout
