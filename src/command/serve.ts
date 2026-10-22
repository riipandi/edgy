import { Effect, Layer } from 'effect'
import { Command, Flag } from 'effect/cli'
import { layer as databaseLayer } from '#/database/layer.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { Database } from '#/database/service.ts'
import { server } from '#/kernel/http/serve.ts'

const migrateBeforeStart = Effect.gen(function* () {
  const db = yield* Database
  const result = yield* Effect.promise(() => migrateToLatest(db))
  if (result.error !== undefined)
    return yield* Effect.fail(new Error('migration failed', { cause: result.error }))
  if ((result.results ?? []).length === 0) yield* Effect.logInfo('database is up to date')
  for (const item of result.results ?? [])
    yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
}).pipe(Effect.provide(databaseLayer))

export const serveCmd = Command.make(
  'serve',
  {
    autoMigrate: Flag.Boolean('auto-migrate').pipe(
      Flag.withDescription('Run pending database migrations before starting'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config.autoMigrate) yield* migrateBeforeStart
      yield* Layer.launch(server)
    })
)
