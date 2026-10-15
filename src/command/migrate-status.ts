import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { DatabaseLayer } from '../database/layer.ts'
import { getMigrationInfos } from '../database/migrator.ts'
import { print } from './helper.ts'

/** `migrate:status` — show the migration status, grouped by state. */
export const migrateStatusCmd = Command.make('migrate:status', {}, () =>
  Effect.gen(function* () {
    const infos = yield* getMigrationInfos
    if (infos.length === 0) {
      yield* print('No migrations registered')
      return
    }

    const executed = infos.filter((info) => info.executedAt !== undefined)
    const pending = infos.filter((info) => info.executedAt === undefined)

    yield* print(`Executed (${executed.length}):`)
    for (const info of executed) {
      yield* print(`  ${info.name} (${info.executedAt!.toISOString()})`)
    }
    if (executed.length === 0) yield* print('  (none)')

    yield* print(`Pending (${pending.length}):`)
    for (const info of pending) {
      yield* print(`  ${info.name}`)
    }
    if (pending.length === 0) yield* print('  (none)')
  })
).pipe(Command.provide(DatabaseLayer), Command.withDescription('Check database migration status'))
