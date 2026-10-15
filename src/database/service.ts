import { Context, Effect, LogLevel, Schedule } from 'effect'
import { type Kysely, type LogEvent, sql, type Transaction } from 'kysely'
import { DatabaseError, isTransientFailure } from '../kernel/errors.ts'
import { currentRequestId } from '../kernel/http/request_context.ts'
import { describeFailure, redactText } from '../kernel/redact.ts'
import type { Database } from './schema.ts'

declare module '../kernel/http/runtime.ts' {
  interface HttpServices {
    database: DatabaseService
  }
}

/**
 * Whether a database failure is a uniqueness violation. `node:sqlite` reports an extended result
 * code on `errcode`; D1 reports only the message text. Both are recognised.
 */
export const isUniqueViolation = (error: DatabaseError): boolean => {
  const { cause } = error
  if (typeof cause !== 'object' || cause === null) return false
  if ('errcode' in cause && (cause.errcode === 2067 || cause.errcode === 1555)) return true
  return 'message' in cause && String(cause.message).includes('UNIQUE constraint failed')
}

/** Up to two retries, about 50 ms then 100 ms apart, with jitter. The request timeout caps the total. */
const readRetry = {
  schedule: Schedule.jittered(Schedule.exponential('50 millis')),
  times: 2,
  while: isTransientFailure
} as const

/**
 * Database service. Callers depend on this key rather than a raw `Kysely`, so the connection
 * lifecycle stays in the Effect scope and the driver (`sqlite` or `d1`) is a deployment choice.
 */
export class DatabaseService extends Context.Service<
  DatabaseService,
  {
    readonly db: Kysely<Database>
    /** Runs a Kysely operation and maps any rejection to {@link DatabaseError}. */
    readonly query: <A>(
      run: (db: Kysely<Database>) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>
    /**
     * Like {@link query}, for read-only operations. On a networked driver (D1) it retries transient
     * failures up to twice with jittered backoff; elsewhere it is exactly `query`. Never pass a write.
     */
    readonly read: <A>(run: (db: Kysely<Database>) => Promise<A>) => Effect.Effect<A, DatabaseError>
    /**
     * Runs `run` atomically: commits when it resolves, rolls back when it rejects. Use the `trx`
     * handle inside, not the outer `db`. Fails with {@link DatabaseError} on D1.
     */
    readonly transaction: <A>(
      run: (trx: Transaction<Database>) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>
    /** Cheapest round trip to the database; used by the readiness probe. */
    readonly ping: Effect.Effect<void, DatabaseError>
  }
>()('DatabaseService') {}

/** Rounds to 0.01 ms, the request log precision. */
const roundMs = (millis: number): number => Math.round(millis * 100) / 100

/**
 * Builds Kysely's `log` callback on the Effect logger.
 *
 * `query` events log at `Trace`, the only level that prints statements, and are skipped before any
 * Effect is built when `Trace` is off. `error` events log at `Warn` with the statement, which a
 * `DatabaseError` lacks. They are not errors: unique violations are expected.
 *
 * Bound parameters are never logged, since they carry user data.
 *
 * Kysely calls the callback outside any fiber, so each entry runs on a snapshot of the layer's context.
 */
export const makeQueryLogger = Effect.gen(function* () {
  const traceEnabled = yield* LogLevel.isEnabled('Trace')
  const run = Effect.runSyncWith(yield* Effect.context())

  const annotations = (fields: Record<string, unknown>): Record<string, unknown> => {
    const requestId = currentRequestId()
    return requestId === undefined ? fields : { requestId, ...fields }
  }

  return (event: LogEvent): void => {
    const durationMs = roundMs(event.queryDurationMillis)
    const { sql: statement } = event.query

    if (event.level === 'query') {
      if (traceEnabled) {
        run(Effect.logTrace(statement).pipe(Effect.annotateLogs(annotations({ durationMs }))))
      }
      return
    }

    run(
      Effect.logWarning('Query failed').pipe(
        Effect.annotateLogs(
          annotations({
            sql: redactText(statement),
            durationMs,
            error: describeFailure(event.error)
          })
        )
      )
    )
  }
})

interface DatabaseOptions {
  /** Whether the driver runs interactive transactions. */
  readonly transactions: boolean
  /** Whether all operations share one connection that callers queue for (`node:sqlite`). */
  readonly singleConnection: boolean
  /** Whether {@link DatabaseService.read} retries transient failures (a networked driver). */
  readonly retryReads: boolean
}

/** Wraps a Kysely instance in the service contract. Drivers differ only in connection setup. */
export const makeDatabaseService = (
  db: Kysely<Database>,
  options: DatabaseOptions
): DatabaseService['Service'] => {
  const query: DatabaseService['Service']['query'] = (run) =>
    Effect.tryPromise({
      // Aborts on interruption. On a single-connection driver the queue is the cancellation point: a
      // query still waiting when the request is cancelled never runs, so a client retry after a 504
      // cannot create the row twice.
      try: (signal) =>
        options.singleConnection ? db.connection().execute(run, { signal }) : run(db),
      catch: (cause) => new DatabaseError({ cause })
    })

  const read: DatabaseService['Service']['read'] = (run) =>
    options.retryReads
      ? query(run).pipe(
          Effect.tapError((error) =>
            isTransientFailure(error)
              ? Effect.logWarning('Transient database error on a read', error.cause)
              : Effect.void
          ),
          Effect.retry(readRetry)
        )
      : query(run)

  const transaction: DatabaseService['Service']['transaction'] = (run) =>
    options.transactions
      ? Effect.tryPromise({
          try: () => db.transaction().execute(run),
          catch: (cause) => new DatabaseError({ cause })
        })
      : Effect.fail(
          new DatabaseError({
            cause: new Error('Transactions are not supported by the configured database driver')
          })
        )

  return DatabaseService.of({
    db,
    query,
    read,
    transaction,
    ping: Effect.asVoid(query((connection) => sql`select 1`.execute(connection)))
  })
}
