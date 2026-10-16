import { Data, Duration, ErrorReporter, Schema, SchemaIssue, type StandardSchema } from 'effect'
import { describeFailure, isSensitiveName } from './redact.ts'

/**
 * What every application error tells the HTTP layer: its status, client-safe message and detail.
 * The responder only renders these, so a new error never needs kernel changes.
 *
 * `code`, `clientMessage`, `detail` and `retryable` reach the client and must carry no internals
 * (SQL, stack traces, causes). `cause` is for diagnostics: it is logged redacted, and shown only
 * at `LOG_LEVEL=Debug` or below. Failures with `status >= 500` are reported with their cause;
 * expected ones (below 500) set `ErrorReporter.ignore`.
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

/** Validation failure wrapping a `SchemaError`. */
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
   * Issues for the response body. Messages for secret fields are replaced, because a schema
   * message can echo the rejected value.
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
 * Whether a failure is transient, so repeating it can succeed: a dropped connection, a storage
 * timeout, an overloaded or locked database. Matched on the message, since D1 and `node:sqlite`
 * report these without a code. A constraint, syntax or missing-table error is never transient.
 */
export const isTransientFailure = (error: { readonly cause: unknown }): boolean => {
  const { cause } = error
  if (typeof cause !== 'object' || cause === null || !('message' in cause)) return false
  return /network connection lost|storage operation exceeded timeout|overloaded|temporarily unavailable|timed out|SQLITE_BUSY|database is locked/i.test(
    String(cause.message)
  )
}

/**
 * Database failure wrapping a driver error. `retryable` is the check the read retry uses, so
 * clients retry exactly when the server does.
 */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: unknown
}> {
  readonly status = 500
  readonly code = 'DATABASE_ERROR'
  readonly clientMessage = 'Database error'
  /** The redacted driver message, so logs say what failed. Clients still get `clientMessage`. */
  override get message(): string {
    return describeFailure(this.cause)
  }
  get retryable(): boolean {
    return isTransientFailure(this)
  }
}

/** A write broke a uniqueness rule, such as a duplicate email. A client error: 409, not 500. */
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
  override get message(): string {
    return `Request exceeded ${Duration.toMillis(this.after)}ms`
  }
  get detail(): { readonly timeout_ms: number } {
    return { timeout_ms: Duration.toMillis(this.after) }
  }
}
