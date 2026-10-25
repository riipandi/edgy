import { it } from '@effect/vitest'
import { Effect, Layer, Logger, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { AppConfig } from '#/kernel/config/config.ts'
import { dependencyDuration } from '#/observer/dependencies.ts'
import { config } from '../../tests/fixtures/config.ts'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { DatabaseLayer, makeDatabaseLayer, makeDatabaseService } from './adapter.ts'
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
