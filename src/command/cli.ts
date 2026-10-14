import { Command } from 'effect/cli'
import { migrateCmd } from './migrate.ts'
import { seedCmd } from './seed.ts'
import { serveCmd } from './serve.ts'

const version = '1.0.0'

const rootCmd = Command.make('h3-effect').pipe(
  Command.withDescription('h3 + Effect HTTP server'),
  Command.withSubcommands([serveCmd, migrateCmd, seedCmd])
)

/**
 * Root CLI program. Running it without a subcommand prints the help document.
 */
export const run = Command.run(rootCmd, { version })
