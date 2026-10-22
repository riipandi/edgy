import { Effect, Layer } from 'effect'
import { Command, Flag } from 'effect/cli'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrateToLatest } from '#/database/migrator.ts'
import { runSeeders } from '#/database/seeder.ts'
import { AppConfig } from '#/kernel/config/config.ts'
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

// Resolves with the signal name when a shutdown signal arrives. The scope then
// closes normally, which awaits every finalizer; interruption would detach
// them instead. A second signal falls back to Node's force-exit.
const awaitShutdownSignal = Effect.callback<string>((resume) => {
  const handler = (signal: NodeJS.Signals): void => resume(Effect.succeed(signal))
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
  return Effect.sync(() => {
    process.off('SIGINT', handler)
    process.off('SIGTERM', handler)
  })
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
      if (autoMigrate) {
        // Migrations run on their own database session so the server's
        // long-lived connection is only opened once the schema is ready.
        yield* migrateBeforeStart(config.seed).pipe(Effect.provide(DatabaseLayer))
      }
      // The server waits for a shutdown signal and completes its scope normally,
      // so every finalizer — connection drain, database and Redis closes,
      // telemetry flush — runs and is awaited before the process exits.
      yield* Effect.gen(function* () {
        const signal = yield* awaitShutdownSignal
        yield* Effect.logInfo(`shutting down (received ${signal})`)
      }).pipe(Effect.provide(server.pipe(Layer.provideMerge(ApplicationLayer))))
      yield* Effect.logInfo('application terminated')
    })
).pipe(Command.withDescription('Start the application server'))
