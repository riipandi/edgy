import { Effect, Layer } from 'effect'
import { Context, Data, LogLevel } from 'effect'
import { sql, type Kysely, type LogEvent } from 'kysely'
import { AppConfig } from '#/kernel/config/config.ts'
import { withDependencyTelemetry, type DependencyStore } from '#/observer/dependencies.ts'
import { openDatabase } from './dialect/sqlite.ts'
import type { DB } from './schema.ts'

export type DatabaseDialectType = 'sqlite' | 'postgres'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

export class Database extends Context.Service<
  Database,
  {
    readonly db: Kysely<DB>
    readonly query: <A>(run: (db: Kysely<DB>) => Promise<A>) => Effect.Effect<A, DatabaseError>
    readonly read: <A>(run: (db: Kysely<DB>) => Promise<A>) => Effect.Effect<A, DatabaseError>
    readonly ping: Effect.Effect<void, DatabaseError>
  }
>()('Database') {}

export const makeQueryLogger = Effect.gen(function* () {
  const traceEnabled = yield* LogLevel.isEnabled('Trace')
  const runSync = Effect.runSyncWith(yield* Effect.context())

  return (event: LogEvent): void => {
    if (event.level === 'query' && !traceEnabled) return
    const log = event.level === 'query' ? Effect.logTrace : Effect.logWarning
    runSync(
      log(event.level === 'query' ? event.query.sql : 'Database query failed').pipe(
        Effect.annotateLogs({
          durationMs: Math.round(event.queryDurationMillis * 100) / 100,
          ...(event.level === 'error' ? { cause: event.error } : {})
        })
      )
    )
  }
})

export const makeDatabaseService = (db: Kysely<DB>, store: DependencyStore = 'sqlite') => {
  const runQuery = <A>(run: (db: Kysely<DB>) => Promise<A>): Effect.Effect<A, DatabaseError> =>
    Effect.tryPromise({
      try: (signal) => db.connection().execute(run, { signal }),
      catch: (cause) => new DatabaseError({ cause })
    })

  return Database.of({
    db,
    query: (run) =>
      runQuery(run).pipe(withDependencyTelemetry({ store, op: 'query', span: 'database.query' })),
    read: (run) =>
      runQuery(run).pipe(withDependencyTelemetry({ store, op: 'read', span: 'database.read' })),
    ping: runQuery((connection) => sql`select 1`.execute(connection)).pipe(
      withDependencyTelemetry({ store, op: 'ping', span: 'database.ping' }),
      Effect.asVoid
    )
  })
}

export const DatabaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const log = yield* makeQueryLogger
    return yield* Effect.acquireRelease(
      Effect.sync(() => openDatabase(config.database.path, log)),
      (database) =>
        Effect.logInfo('closing database connection').pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: () => database.destroy(),
              catch: (cause) => new DatabaseError({ cause })
            }).pipe(
              Effect.tap(() => Effect.logInfo('database connection closed')),
              Effect.catch((error) => Effect.logError(`database destroy failed: ${error.message}`))
            )
          )
        )
    )
  }).pipe(Effect.map(makeDatabaseService))
)
