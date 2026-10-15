import { describe, expect, it } from '@effect/vitest'
import { Cause, Duration, Schema } from 'effect'
import { DatabaseError, NotFound, RequestTimeout, ValidationError } from '../errors.ts'
import { defectBody, errorBody, statusBody } from './error_body.ts'

describe('errorBody', () => {
  it('gives every error a code and says whether to retry', () => {
    expect(errorBody(new NotFound({ resource: 'User', id: 'user_x' }), false)).toEqual({
      code: 'NOT_FOUND',
      retryable: false,
      details: { id: 'user_x' }
    })
    expect(errorBody(new RequestTimeout({ after: Duration.seconds(30) }), false)).toEqual({
      code: 'REQUEST_TIMEOUT',
      retryable: true,
      details: { timeout_ms: 30_000 }
    })
  })

  it('marks a database failure retryable exactly when it is transient', () => {
    const transient = new DatabaseError({ cause: new Error('D1_ERROR: Network connection lost') })
    const permanent = new DatabaseError({ cause: new Error('no such table: users') })
    expect(errorBody(transient, false).retryable).toBe(true)
    expect(errorBody(permanent, false).retryable).toBe(false)
  })

  it('keeps the cause out unless diagnostics are on, and only for server errors', () => {
    const failure = new DatabaseError({ cause: new Error('SQLITE_ERROR: no such table: users') })
    expect(errorBody(failure, false)).not.toHaveProperty('debug')
    expect(errorBody(failure, true).debug).toEqual({
      type: 'DatabaseError',
      message: 'SQLITE_ERROR: no such table: users'
    })
    // a client error explains itself through `details`; there is nothing behind it
    expect(errorBody(new NotFound({ resource: 'User', id: 'x' }), true)).not.toHaveProperty('debug')
  })

  it('redacts secrets in the cause even when diagnostics are on', () => {
    const failure = new DatabaseError({
      cause: new Error('connect ECONNREFUSED redis://:securedb@localhost:6379 password=hunter2')
    })
    const text = JSON.stringify(errorBody(failure, true))
    expect(text).not.toContain('securedb')
    expect(text).not.toContain('hunter2')
    expect(text).toContain('ECONNREFUSED')
  })

  it('does not echo the value of a secret field in a validation message', () => {
    const schema = Schema.Struct({
      email: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
      password: Schema.String.pipe(Schema.check(Schema.isMinLength(12)))
    })
    let error: ValidationError | undefined
    try {
      Schema.decodeSync(schema)({ email: 'short', password: 'hunter2' }, { errors: 'all' })
    } catch (schemaError) {
      if (Schema.isSchemaError(schemaError)) error = new ValidationError({ schemaError })
    }
    const issues = error?.issues ?? []
    expect(issues.find((issue) => issue.path[0] === 'password')?.message).toBe('Invalid value')
    expect(JSON.stringify(issues)).not.toContain('hunter2')
    expect(issues.find((issue) => issue.path[0] === 'email')?.message).not.toBe('Invalid value')
  })
})

describe('defectBody', () => {
  it('is an internal error, with the redacted defect only when diagnostics are on', () => {
    const cause = Cause.die(new Error('boom token=abc123'))
    expect(defectBody(cause, false)).toEqual({ code: 'INTERNAL_ERROR', retryable: false })
    const debug = defectBody(cause, true).debug
    expect(debug?.type).toBe('Defect')
    expect(debug?.message).toContain('boom')
    expect(debug?.message).not.toContain('abc123')
  })
})

describe('statusBody', () => {
  it('derives the code from the status and marks the ones worth retrying', () => {
    expect(statusBody(404, { diagnostics: false })).toEqual({ code: 'NOT_FOUND', retryable: false })
    expect(statusBody(503, { diagnostics: false }).retryable).toBe(true)
    expect(statusBody(418, { diagnostics: false }).code).toBe('HTTP_418')
  })

  it('repeats Retry-After as a detail', () => {
    expect(statusBody(429, { retryAfter: 12, diagnostics: false })).toEqual({
      code: 'RATE_LIMITED',
      retryable: true,
      details: { retry_after: 12 }
    })
  })
})
