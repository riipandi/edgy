import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { migrateToLatest } from '../database/migrator.ts'
import { AppLayer } from '../layers.ts'
import { serveHttp } from '../server.ts'

/** `serve` — start the HTTP server, optionally migrating first. */
export const serveCmd = Command.make(
  'serve',
  {
    'auto-migrate': Flag.Boolean('auto-migrate').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Run pending database migrations before starting the server')
    )
  },
  (config) =>
    Effect.gen(function* () {
      if (config['auto-migrate']) {
        const results = yield* migrateToLatest
        if (results.length === 0) {
          yield* Effect.logInfo('No pending migrations')
        } else {
          yield* Effect.logInfo(`Applied ${results.length} migration(s):`)
          for (const result of results) {
            yield* Effect.logInfo(`  ${result.status}: ${result.migrationName}`)
          }
        }
      }

      return yield* serveHttp
    })
).pipe(Command.provide(AppLayer), Command.withDescription('Start the HTTP server'))
