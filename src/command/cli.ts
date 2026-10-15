import { Command } from 'effect/cli'
import pkg from '../../package.json' with { type: 'json' }
import { configGenerateCmd } from './config-generate.ts'
import { migrateDownCmd } from './migrate-down.ts'
import { migrateResetCmd } from './migrate-reset.ts'
import { migrateSeedCmd } from './migrate-seed.ts'
import { migrateStatusCmd } from './migrate-status.ts'
import { migrateUpCmd } from './migrate-up.ts'
import { serveCmd } from './serve.ts'

const rootCmd = Command.make('edgy').pipe(
  Command.withDescription('h3 + Effect HTTP server'),
  Command.withSubcommands([
    serveCmd,
    configGenerateCmd,
    migrateUpCmd,
    migrateDownCmd,
    migrateStatusCmd,
    migrateResetCmd,
    migrateSeedCmd
  ])
)

/**
 * Root CLI program. Running it without a subcommand prints the help document.
 *
 * The version is read from `package.json` so `--version` can never drift from
 * the published manifest.
 */
export const run = Command.run(rootCmd, { version: pkg.version })
