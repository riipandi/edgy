import { Effect, Layer } from 'effect'
import { Command, Flag } from 'effect/cli'
import { migrateToLatest } from '#/database/migrator.ts'
import { runSeeders } from '#/database/seeder.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { awaitShutdownSignal } from '#/kernel/graceful.ts'
import { server } from '#/kernel/http/serve.ts'
import { ApplicationLayer } from '#/kernel/layers.ts'

const migrateBeforeStart = (seed: boolean) =>
  Effect.gen(function* () {
    const results = yield* migrateToLatest
    if (results.length === 0) yield* Effect.logInfo('database is up to date')
    for (const item of results) yield* Effect.logInfo(`${item.status} ${item.migrationName}`)
    if (seed) {
      yield* runSeeders
      yield* Effect.logInfo('Seeders applied')
    }
  })

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
      // Migrations and requests must share one layer build: a second build
      // would open a second connection, and the listener would start before the
      // schema exists. Running the migration while the layer builds also keeps
      // the listener closed until the schema is ready.
      const application = autoMigrate
        ? Layer.effectDiscard(migrateBeforeStart(config.seed)).pipe(
            Layer.provideMerge(ApplicationLayer)
          )
        : ApplicationLayer
      // The server waits for a shutdown signal and completes its scope normally,
      // so every finalizer — connection drain, database and Redis closes,
      // telemetry flush — runs and is awaited before the process exits.
      yield* Effect.gen(function* () {
        const signal = yield* awaitShutdownSignal
        yield* Effect.logInfo(`shutting down (received ${signal})`)
      }).pipe(Effect.provide(server.pipe(Layer.provideMerge(application))))
      yield* Effect.logInfo('application terminated')
    })
).pipe(Command.withDescription('Start the application server'))
