import { it } from '@effect/vitest'
import { Effect, Layer, Logger, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { AppConfig } from '#/kernel/config/config.ts'
import { dependencyDuration } from '#/observer/dependencies.ts'
import { config } from '../../tests/fixtures/config.ts'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { DatabaseLayer, makeDatabaseService } from './adapter.ts'
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

    yield* service.ping
    yield* service.read(() => Promise.resolve(1))
    yield* service.ping

    const ping = yield* Metric.value(
      Metric.withAttributes(dependencyDuration, { store: 'sqlite', op: 'ping' })
    )
    expect(ping.count).toBe(2)

    const read = yield* Metric.value(
      Metric.withAttributes(dependencyDuration, { store: 'sqlite', op: 'read' })
    )
    expect(read.count).toBe(1)
  })
)

it.effect('announces the transport it connects to', () =>
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

    // The operator needs to know which transport a deploy actually reached; a
    // bare path, a file: URI and a remote URL all arrive in DATABASE_URL.
    expect(lines).toContain(`Connecting database local ${path}`)
    expect(lines).toContain('Database connected')
  })
)
