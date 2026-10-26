import { it } from '@effect/vitest'
import { Effect, Layer, Logger, Metric, References } from 'effect'
import type { LogEvent } from 'kysely'
import { expect } from 'vite-plus/test'
import { AppConfig } from '#/kernel/config/config.ts'
import { dependencyDuration } from '#/observer/dependencies.ts'
import { config } from '../../tests/fixtures/config.ts'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { makeDatabaseLayer, makeDatabaseService, makeQueryLogger } from './adapter.ts'
import { DatabaseLayer } from './adapter.ts'
import { openTursoDatabase } from './dialect.ts'

it.effect('every database op flows through the dependency series', () =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.tryPromise(() =>
        openTursoDatabase({ kind: 'local', path: testDatabasePath('adapter.db') })
      ),
      (database) => Effect.promise(() => database.destroy())
    )
    const service = makeDatabaseService(db)

    // The metric registry is process-global and other suites (the healthcheck
    // command) record into the same series, so only the delta is asserted.
    const series = (op: string) =>
      Metric.withAttributes(dependencyDuration, { store: 'sqlite', op })
    const pingBefore = (yield* Metric.value(series('ping'))).count
    const readBefore = (yield* Metric.value(series('read'))).count

    yield* service.ping
    yield* service.read(() => Promise.resolve(1))
    yield* service.ping

    const ping = yield* Metric.value(series('ping'))
    expect(ping.count).toBe(pingBefore + 2)

    const read = yield* Metric.value(series('read'))
    expect(read.count).toBe(readBefore + 1)
  })
)

it.effect('maps a failed operation into the DatabaseError channel', () =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.tryPromise(() =>
        openTursoDatabase({ kind: 'local', path: testDatabasePath('adapter-failure.db') })
      ),
      (database) => Effect.promise(() => database.destroy())
    )
    const service = makeDatabaseService(db)

    const failure = yield* Effect.flip(service.read(() => Promise.reject(new Error('boom'))))
    expect(failure.message).toBe('boom')
  })
)

it.effect('announces the transport it connects to when lifecycle logs are on', () =>
  Effect.gen(function* () {
    const path = testDatabasePath('adapter-announce.db')
    const lines: Array<string> = []
    const logger = Logger.layer([
      Logger.make(({ message }) => {
        lines.push(String(message))
      })
    ])

    yield* Effect.void.pipe(
      Effect.provide(
        makeDatabaseLayer({ lifecycleLogs: true }).pipe(
          Layer.provide(
            Layer.succeed(AppConfig, {
              ...config,
              database: { ...config.database, target: { kind: 'local', path } }
            })
          )
        )
      ),
      Effect.provide(logger),
      Effect.scoped
    )

    // The operator needs to know which transport a deploy actually reached; a
    // bare path, a file: URI and a remote URL all arrive in DATABASE_URL.
    expect(lines).toContain(`Connecting database local ${path}`)
    expect(lines).toContain('Database connected')
    expect(lines).toContain('Closing database connection')
    expect(lines).toContain('Database connection closed')
  })
)

it.effect('stays silent when lifecycle logs are off', () =>
  Effect.gen(function* () {
    const path = testDatabasePath('adapter-silent.db')
    const lines: Array<string> = []
    const logger = Logger.layer([
      Logger.make(({ message }) => {
        lines.push(String(message))
      })
    ])

    yield* Effect.void.pipe(
      Effect.provide(
        DatabaseLayer.pipe(
          Layer.provide(
            Layer.succeed(AppConfig, {
              ...config,
              database: { ...config.database, target: { kind: 'local', path } }
            })
          )
        )
      ),
      Effect.provide(logger),
      Effect.scoped
    )

    expect(lines).toEqual([])
  })
)

const fakeLogEvent = (level: 'query' | 'error'): LogEvent =>
  ({
    level,
    query: { sql: 'select 1', parameters: [], query: 'select 1', queryId: 'repro' },
    queryDurationMillis: 1234.567,
    ...(level === 'error' ? { error: new Error('boom') } : {})
  }) as unknown as LogEvent

it.effect('drops query events below trace and warns for failures', () =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const capture = Logger.layer([
      Logger.make((options) => lines.push(`${options.logLevel}|${String(options.message)}`))
    ])

    yield* Effect.gen(function* () {
      const handler = yield* makeQueryLogger
      handler(fakeLogEvent('query'))
      handler(fakeLogEvent('error'))
    }).pipe(Effect.provide(capture))

    // The query line would drown an info-level console; only the failure speaks.
    expect(lines).toEqual(['Warn|Database query failed'])
  })
)

it.effect('traces query statements when the minimum level is trace', () =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const capture = Logger.layer([
      Logger.make((options) => lines.push(`${options.logLevel}|${String(options.message)}`))
    ])

    yield* Effect.gen(function* () {
      const handler = yield* makeQueryLogger
      handler(fakeLogEvent('query'))
      handler(fakeLogEvent('error'))
    }).pipe(Effect.provide(capture), Effect.provideService(References.MinimumLogLevel, 'Trace'))

    expect(lines).toEqual(['Trace|select 1', 'Warn|Database query failed'])
  })
)
