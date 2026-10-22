import { Effect, Layer } from 'effect'
import { Command, Flag } from 'effect/cli'
import { layer as databaseLayer } from '#/database/layer.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { runSeeders } from '#/database/seeders/index.ts'
import { Database } from '#/database/service.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { server } from '#/kernel/http/serve.ts'

const migrateBeforeStart = (seed: boolean) =>
  Effect.gen(function* () {
    const { db } = yield* Database
    const result = yield* Effect.promise(() => migrateToLatest(db))
    if (result.error !== undefined)
      return yield* Effect.fail(new Error('migration failed', { cause: result.error }))
    if ((result.results ?? []).length === 0) yield* Effect.logInfo('database is up to date')
    for (const item of result.results ?? [])
      yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
    if (seed) {
      yield* Effect.promise(() => runSeeders(db))
      yield* Effect.logInfo('seeders applied')
    }
  }).pipe(Effect.provide(databaseLayer))

export const serveCmd = Command.make(
  'serve',
  {
    autoMigrate: Flag.Boolean('auto-migrate').pipe(
      Flag.withDescription('Run pending database migrations before starting'),
      Flag.withDefault(false)
    ),
    seed: Flag.Boolean('seed').pipe(
      Flag.withDescription('Run the database seeders (requires --auto-migrate)'),
      Flag.withDefault(false)
    )
  },
  (config) =>
    Effect.gen(function* () {
      const appConfig = yield* AppConfig
      const autoMigrate = config.autoMigrate || appConfig.database.autoMigrate
      if (config.seed && !autoMigrate)
        return yield* Effect.fail(
          new Error('--seed requires --auto-migrate or DATABASE_AUTO_MIGRATE=true')
        )
      if (autoMigrate) yield* migrateBeforeStart(config.seed)
      yield* Layer.launch(server)
    })
).pipe(Command.withDescription('Start the application server'))
