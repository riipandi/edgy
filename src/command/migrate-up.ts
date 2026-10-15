import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/cli'
import { databaseLayer } from '../database/layer.ts'
import { getMigrationInfos, migrateTo, migrateToLatest } from '../database/migrator.ts'
import { announceRemote, ensure, print, remoteFlag } from './helper.ts'

/** Applies pending migrations, stopping at `--to` when given. */
export const migrateUpCmd = Command.make(
  'migrate:up',
  {
    to: Flag.String('to').pipe(
      Flag.optional,
      Flag.withDescription('Apply migrations only up to this migration name')
    ),
    remote: remoteFlag,
    'dry-run': Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('List the pending migrations without applying them')
    )
  },
  (config) =>
    Effect.gen(function* () {
      yield* announceRemote(config.remote)
      const infos = yield* getMigrationInfos
      if (Option.isSome(config.to)) {
        const target = config.to.value
        const at = infos.findIndex((info) => info.name === target)
        yield* ensure(at !== -1, `Unknown migration: ${target}`)
        // Kysely would roll back the later ones to reach an earlier target; that is migrate:down.
        yield* ensure(
          infos.slice(at + 1).every((info) => info.executedAt === undefined),
          `${target} is already applied and later migrations ran after it; use migrate:down to roll back`
        )
      }

      if (config['dry-run']) {
        const pending = infos.filter(
          (info) =>
            info.executedAt === undefined &&
            (!Option.isSome(config.to) || info.name <= config.to.value)
        )
        if (pending.length === 0) {
          yield* print('No pending migrations')
          return
        }
        yield* print(`${pending.length} pending migration(s) (dry run, nothing applied):`)
        for (const info of pending) yield* print(`  ${info.name}`)
        return
      }

      const results = Option.isSome(config.to)
        ? yield* migrateTo(config.to.value)
        : yield* migrateToLatest
      if (results.length === 0) {
        yield* print('No pending migrations')
        return
      }
      for (const result of results) {
        yield* print(`${result.status}: ${result.migrationName}`)
      }
    })
).pipe(
  Command.provide((config) => databaseLayer({ remote: config.remote })),
  Command.withDescription('Run database migrations')
)
