import {
  Data,
  type Duration,
  ErrorReporter,
  Schema,
  SchemaIssue,
  type StandardSchema
} from 'effect'

/**
 * What every application error tells the HTTP layer about itself. The error
 * owns its status, its client-safe message and its detail, so the responder
 * only renders: adding an error never means editing the kernel.
 *
 * `clientMessage` and `detail` reach the client, so they must never carry
 * internals (SQL, stack traces, causes). Failures with `status >= 500` are
 * reported with their cause; expected ones (below 500) carry
 * `ErrorReporter.ignore` and are not.
 */
export interface AppError {
  readonly _tag: string
  readonly status: number
  readonly clientMessage: string
  readonly detail?: unknown
}

/** A resource looked up by id does not exist. */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly resource: string
  readonly id: string | number
}> {
  readonly status = 404
  override readonly [ErrorReporter.ignore] = true
  get clientMessage(): string {
    return `${this.resource} not found`
  }
  get detail(): { readonly id: string | number } {
    return { id: this.id }
  }
}

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

  readonly status = 400
  override readonly [ErrorReporter.ignore] = true
  readonly clientMessage = 'Validation failed'
  get detail(): ReadonlyArray<ValidationIssue> {
    return this.issues
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
}> {
  readonly status = 500
  readonly clientMessage = 'Database error'
}

/**
 * A write violated a uniqueness rule (for example a duplicate email). A client
 * error, unlike {@link DatabaseError}, so it answers 409 instead of 500.
 */
export class Conflict extends Data.TaggedError('Conflict')<{
  readonly resource: string
}> {
  readonly status = 409
  override readonly [ErrorReporter.ignore] = true
  get clientMessage(): string {
    return `${this.resource} already exists`
  }
}

/** The program did not finish within `REQUEST_TIMEOUT`. */
export class RequestTimeout extends Data.TaggedError('RequestTimeout')<{
  readonly after: Duration.Duration
}> {
  readonly status = 504
  readonly clientMessage = 'Request timed out'
}
