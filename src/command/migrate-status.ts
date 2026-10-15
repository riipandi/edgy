import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { getMigrationInfos } from '../database/migrator.ts'
import { DatabaseLayer } from '../runtime.ts'

/** `migrate:status` — show the migration status, grouped by state. */
export const migrateStatusCmd = Command.make('migrate:status', {}, () =>
  Effect.gen(function* () {
    const infos = yield* getMigrationInfos
    if (infos.length === 0) {
      yield* Effect.logInfo('No migrations registered')
      return
    }

    const executed = infos.filter((info) => info.executedAt !== undefined)
    const pending = infos.filter((info) => info.executedAt === undefined)

    yield* Effect.logInfo(`Executed (${executed.length}):`)
    for (const info of executed) {
      yield* Effect.logInfo(`  ${info.name} (${info.executedAt!.toISOString()})`)
    }
    if (executed.length === 0) yield* Effect.logInfo('  (none)')

    yield* Effect.logInfo(`Pending (${pending.length}):`)
    for (const info of pending) {
      yield* Effect.logInfo(`  ${info.name}`)
    }
    if (pending.length === 0) yield* Effect.logInfo('  (none)')
  }).pipe(Effect.provide(DatabaseLayer))
).pipe(Command.withDescription('Check database migration status'))
