import { Command } from 'effect/cli'
import pkg from '../../package.json' with { type: 'json' }
import { migrateCmd } from './migrate.ts'
import { seedCmd } from './seed.ts'
import { serveCmd } from './serve.ts'

const rootCmd = Command.make('edgy').pipe(
  Command.withDescription('h3 + Effect HTTP server'),
  Command.withSubcommands([serveCmd, migrateCmd, seedCmd])
)

/**
 * Root CLI program. Running it without a subcommand prints the help document.
 *
 * The version is read from `package.json` so `--version` can never drift from
 * the published manifest.
 */
export const run = Command.run(rootCmd, { version: pkg.version })
