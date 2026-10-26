import { Effect, Layer } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { migrateToLatest } from '#/database/migrator.ts'
import { runSeeders, SEEDERS } from '#/database/seeder.ts'
import { AppConfig } from '#/kernel/config/config.ts'
import { awaitShutdownSignal } from '#/kernel/graceful.ts'
import { server } from '#/kernel/http/server.ts'
import { ApplicationLayer } from '#/kernel/layers.ts'

const migrateBeforeStart = (seed: boolean) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Migrating database')
    const results = yield* migrateToLatest
    if (results.length === 0) yield* Effect.logInfo('Database is up to date')
    for (const item of results) yield* Effect.logInfo(`Migrated ${item.migrationName}`)
    if (seed) {
      for (const seeder of SEEDERS) yield* Effect.logInfo(`Seeding ${seeder.name}`)
      yield* runSeeders
      for (const seeder of SEEDERS)
        yield* Effect.logInfo(`Seeded ${seeder.name} (${seeder.records} records)`)
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
          new CliError.UserError({
            cause: '--seed requires --auto-migrate or DATABASE_AUTO_MIGRATE=true',
            userMessage: '--seed requires --auto-migrate or DATABASE_AUTO_MIGRATE=true'
          })
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
        yield* Effect.logInfo(`Shutting down (received ${signal})`)
      }).pipe(Effect.provide(server.pipe(Layer.provideMerge(application))))
      yield* Effect.logInfo('Application terminated')
    })
).pipe(Command.withDescription('Start the application server'))
