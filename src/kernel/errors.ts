import { Data, Duration, ErrorReporter, Schema, SchemaIssue, type StandardSchema } from 'effect'
import { isSensitiveName } from './redact.ts'

/**
 * What every application error tells the HTTP layer about itself. The error
 * owns its status, its client-safe message and its detail, so the responder
 * only renders: adding an error never means editing the kernel.
 *
 * `code`, `clientMessage`, `detail` and `retryable` reach the client, so they must never carry
 * internals (SQL, stack traces, causes); what an operator may additionally see while debugging
 * is the error's `cause`, shown only at `LOG_LEVEL=Debug` or below and always redacted. Failures
 * with `status >= 500` are reported with their cause; expected ones (below 500) carry
 * `ErrorReporter.ignore` and are not.
 */
export interface AppError {
  readonly _tag: string
  readonly status: number
  /** Stable, machine-readable identifier of the failure (`NOT_FOUND`); clients switch on it. */
  readonly code: string
  readonly clientMessage: string
  readonly detail?: unknown
  /** Whether trying the same request again can succeed (a timeout, a busy store). */
  readonly retryable: boolean
  /** What lies behind a server-side failure; for diagnostics only, never in a default response. */
  readonly cause?: unknown
}

/** A resource looked up by id does not exist. */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly resource: string
  readonly id: string | number
}> {
  readonly status = 404
  readonly code = 'NOT_FOUND'
  readonly retryable = false
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
  readonly code = 'VALIDATION_FAILED'
  readonly retryable = false
  override readonly [ErrorReporter.ignore] = true
  readonly clientMessage = 'Validation failed'
  get detail(): ReadonlyArray<ValidationIssue> {
    return this.issues
  }

  /**
   * Flattened list of issues for the response body. A schema's message can quote the value it
   * rejected, so for a field that holds a secret (`password`, `token`…) the message is replaced:
   * the client learns which field is wrong, never an echo of what it sent.
   */
  get issues(): ReadonlyArray<ValidationIssue> {
    return formatIssues(this.schemaError.issue).issues.map((i) => {
      const path = i.path ?? []
      const secret = path.some((segment) => {
        const key = typeof segment === 'object' ? segment.key : segment
        return typeof key === 'string' && isSensitiveName(key)
      })
      return { path, message: secret ? 'Invalid value' : i.message }
    })
  }
}

/**
 * Whether a failure is the kind that goes away on its own, so repeating a read is
 * safe and useful: a dropped connection, a storage timeout, an overloaded or briefly
 * unavailable database, a lock that was not released in time. Matched on the message
 * because D1 and `node:sqlite` report these as plain errors with no code. A constraint
 * violation, a syntax error or a missing table is deliberately *not* transient: repeating
 * it can only fail the same way, later.
 */
export const isTransientFailure = (error: { readonly cause: unknown }): boolean => {
  const { cause } = error
  if (typeof cause !== 'object' || cause === null || !('message' in cause)) return false
  return /network connection lost|storage operation exceeded timeout|overloaded|temporarily unavailable|timed out|SQLITE_BUSY|database is locked/i.test(
    String(cause.message)
  )
}

/**
 * Database failure wrapping a Kysely/SQLite error. `retryable` is the transient check the
 * read retry uses, so a client is told to try again exactly when the server itself would.
 */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: unknown
}> {
  readonly status = 500
  readonly code = 'DATABASE_ERROR'
  readonly clientMessage = 'Database error'
  get retryable(): boolean {
    return isTransientFailure(this)
  }
}

/**
 * A write violated a uniqueness rule (for example a duplicate email). A client
 * error, unlike {@link DatabaseError}, so it answers 409 instead of 500.
 */
export class Conflict extends Data.TaggedError('Conflict')<{
  readonly resource: string
}> {
  readonly status = 409
  readonly code = 'CONFLICT'
  readonly retryable = false
  override readonly [ErrorReporter.ignore] = true
  get clientMessage(): string {
    return `${this.resource} already exists`
  }
  get detail(): { readonly resource: string } {
    return { resource: this.resource }
  }
}

/** The program did not finish within `REQUEST_TIMEOUT`. */
export class RequestTimeout extends Data.TaggedError('RequestTimeout')<{
  readonly after: Duration.Duration
}> {
  readonly status = 504
  readonly code = 'REQUEST_TIMEOUT'
  readonly retryable = true
  readonly clientMessage = 'Request timed out'
  get detail(): { readonly timeout_ms: number } {
    return { timeout_ms: Duration.toMillis(this.after) }
  }
}
