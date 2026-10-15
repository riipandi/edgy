import { Context, Effect, LogLevel, Schedule } from 'effect'
import { type Kysely, type LogEvent, sql, type Transaction } from 'kysely'
import { DatabaseError, isTransientFailure } from '../kernel/errors.ts'
import { currentRequestId } from '../kernel/http/request_context.ts'
import { describeFailure, redactText } from '../kernel/redact.ts'
import type { Database } from './schema.ts'

export { isTransientFailure }

declare module '../kernel/http/runtime.ts' {
  interface HttpServices {
    database: DatabaseService
  }
}

/**
 * Whether a database failure is a uniqueness violation. Repositories use it to
 * turn the generic {@link DatabaseError} into a domain `Conflict`.
 *
 * Two shapes exist: `node:sqlite` reports the extended result code (2067
 * `UNIQUE`, 1555 `PRIMARY KEY`) on `errcode`, while D1 only reports text
 * (`UNIQUE constraint failed: users.email`). Both are recognised, so a
 * repository does not care which driver is configured.
 */
export const isUniqueViolation = (error: DatabaseError): boolean => {
  const { cause } = error
  if (typeof cause !== 'object' || cause === null) return false
  if ('errcode' in cause && (cause.errcode === 2067 || cause.errcode === 1555)) return true
  return 'message' in cause && String(cause.message).includes('UNIQUE constraint failed')
}

/**
 * Up to two more attempts, 50 ms then about 100 ms apart, each delay randomised by
 * jitter so that many requests failing together do not all retry in the same instant.
 * Bounded on purpose: the request timeout still caps the total.
 */
const readRetry = {
  schedule: Schedule.jittered(Schedule.exponential('50 millis')),
  times: 2,
  while: isTransientFailure
} as const

/**
 * Database service. Repositories, the migrator and seeders depend on this key
 * instead of a raw `Kysely` instance, so the connection lifecycle stays owned by
 * the Effect scope and the driver (`sqlite` or `d1`) stays a deployment choice.
 */
export class DatabaseService extends Context.Service<
  DatabaseService,
  {
    readonly db: Kysely<Database>
    /**
     * Runs a Kysely operation and maps any rejection to {@link DatabaseError}.
     * Every query goes through here, so the error channel is uniform and the
     * `tryPromise` boilerplate lives in one place.
     */
    readonly query: <A>(
      run: (db: Kysely<Database>) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>
    /**
     * Like {@link query}, for operations that only **read**. On a driver where
     * transient failures happen (D1, over the network) it repeats the read, up to
     * two more times with jittered backoff, when the failure is transient; elsewhere it
     * is exactly `query`. Never pass a write: repeating one is not safe.
     */
    readonly read: <A>(run: (db: Kysely<Database>) => Promise<A>) => Effect.Effect<A, DatabaseError>
    /**
     * Runs `run` atomically: it commits when the promise resolves and rolls back
     * when it rejects. Inside, use the `trx` handle, never the outer `db`.
     * Fails with {@link DatabaseError} on drivers without transactions (D1).
     */
    readonly transaction: <A>(
      run: (trx: Transaction<Database>) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>
    /** Cheapest round trip to the database; used by the readiness probe. */
    readonly ping: Effect.Effect<void, DatabaseError>
  }
>()('DatabaseService') {}

/** Elapsed time rounded to 0.01 ms, the precision the request log uses. */
const roundMs = (millis: number): number => Math.round(millis * 100) / 100

/**
 * Builds Kysely's `log` callback on top of the Effect logger.
 *
 * - `query` events log the SQL and its duration at `Trace`, the only level that
 *   prints statements. They are skipped before any Effect is built when `Trace`
 *   is disabled, so the hot path pays one boolean check.
 * - `error` events log at `Warn`. They add what a `DatabaseError` lacks (the
 *   statement) and are expected for a unique violation, so they are not errors.
 *
 * Bound parameters are never logged: they carry user data (emails today,
 * credentials tomorrow), and the SQL text already identifies the query.
 *
 * Kysely calls the callback from outside any fiber, so each entry runs on a
 * snapshot of the layer's context, which is where the configured logger lives.
 * The request id comes from {@link currentRequestId}, so the line can be tied to
 * the request that issued the query.
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
  /** Whether the driver can run interactive transactions. */
  readonly transactions: boolean
  /** Whether {@link DatabaseService.read} retries transient failures (a networked driver). */
  readonly retryReads: boolean
}

/**
 * Wraps a Kysely instance in the service contract. Both drivers go through this
 * one function, so `query`, `transaction` and `ping` behave identically and only
 * the connection setup differs.
 */
export const makeDatabaseService = (
  db: Kysely<Database>,
  options: DatabaseOptions
): DatabaseService['Service'] => {
  const query: DatabaseService['Service']['query'] = (run) =>
    Effect.tryPromise({
      try: () => run(db),
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
