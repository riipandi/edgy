import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/cli'
import { getMigrationInfos, migrateTo, migrateToLatest } from '../database/migrator.ts'
import { DatabaseLayer } from '../runtime.ts'

/** `migrate:up` — run pending database migrations. */
export const migrateUpCmd = Command.make(
  'migrate:up',
  {
    to: Flag.String('to').pipe(
      Flag.optional,
      Flag.withDescription('Apply migrations only up to this migration name')
    ),
    'dry-run': Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('List the pending migrations without applying them')
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config['dry-run']) {
        const infos = yield* getMigrationInfos
        const pending = infos.filter(
          (info) =>
            info.executedAt === undefined &&
            (!Option.isSome(config.to) || info.name <= config.to.value)
        )
        if (pending.length === 0) {
          yield* Effect.logInfo('No pending migrations')
          return
        }
        yield* Effect.logInfo(`${pending.length} pending migration(s) (dry run, nothing applied):`)
        for (const info of pending) yield* Effect.logInfo(`  ${info.name}`)
        return
      }

      const results = Option.isSome(config.to)
        ? yield* migrateTo(config.to.value)
        : yield* migrateToLatest
      if (results.length === 0) {
        yield* Effect.logInfo('No pending migrations')
        return
      }
      for (const result of results) {
        yield* Effect.logInfo(`${result.status}: ${result.migrationName}`)
      }
    }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Run database migrations'))
