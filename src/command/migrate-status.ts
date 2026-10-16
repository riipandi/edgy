import { Effect } from 'effect'
import { Command } from 'effect/cli'
import { databaseLayer } from '../database/layer.ts'
import { getMigrationInfos } from '../database/migrator.ts'
import { announceRemote, print, remoteFlag } from './helper.ts'

/** Lists executed and pending migrations. */
export const migrateStatusCmd = Command.make('migrate:status', { remote: remoteFlag }, (config) =>
  Effect.gen(function* () {
    yield* announceRemote(config.remote)
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
).pipe(
  Command.provide((config) => databaseLayer({ remote: config.remote })),
  Command.withDescription('Check database migration status')
)
