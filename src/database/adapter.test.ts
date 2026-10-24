import { it } from '@effect/vitest'
import { Effect, Metric } from 'effect'
import { expect } from 'vite-plus/test'
import { dependencyDuration } from '#/observer/dependencies.ts'
import { testDatabasePath } from '../../tests/fixtures/database-url.ts'
import { makeDatabaseService } from './adapter.ts'
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
