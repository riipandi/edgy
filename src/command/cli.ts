import { Effect } from 'effect'
import { CliConfig, Command, GlobalFlag } from 'effect/cli'
import pkg from '../../package.json' with { type: 'json' }
import { configGenerateCmd } from './generate-config.ts'
import { healthcheckCmd } from './healthcheck.ts'
import { migrateDownCmd } from './migrate-down.ts'
import { migrateResetCmd } from './migrate-reset.ts'
import { migrateSeedCmd } from './migrate-seed.ts'
import { migrateStatusCmd } from './migrate-status.ts'
import { migrateUpCmd } from './migrate-up.ts'
import { serveCmd } from './serve.ts'

const rootCmd = Command.make(pkg.name).pipe(
  Command.withDescription(pkg.description),
  Command.withSubcommands([
    serveCmd,
    configGenerateCmd,
    healthcheckCmd,
    migrateUpCmd,
    migrateDownCmd,
    migrateStatusCmd,
    migrateResetCmd,
    migrateSeedCmd
  ])
)

const LOG_LEVEL_FLAG = '--log-level'

/**
 * Lowercases the `--log-level` value, so `--log-level Debug` matches the
 * lowercase choices the flag declares. `LOG_LEVEL` accepts the same vocabulary
 * capitalized, so the two entry points agree.
 */
export const normalizeArgs = (args: ReadonlyArray<string>): ReadonlyArray<string> => {
  const normalized: Array<string> = []
  let expectsValue = false
  for (const arg of args) {
    if (expectsValue) {
      normalized.push(arg.toLowerCase())
      expectsValue = false
    } else if (arg === LOG_LEVEL_FLAG) {
      normalized.push(arg)
      expectsValue = true
    } else if (arg.startsWith(`${LOG_LEVEL_FLAG}=`)) {
      normalized.push(`${LOG_LEVEL_FLAG}=${arg.slice(LOG_LEVEL_FLAG.length + 1).toLowerCase()}`)
    } else {
      normalized.push(arg)
    }
  }
  return normalized
}

// The built-ins stay the canonical objects: `Command.run` installs the parsed
// level by comparing against `GlobalFlag.LogLevel` itself, so a copy parses the
// flag and then drops it. `--wizard` and `--completions` are left out: they are
// not part of the documented surface.
const cliConfig = CliConfig.layer({
  builtIns: [GlobalFlag.Help, GlobalFlag.Version, GlobalFlag.LogLevel]
})

/** Root CLI program. Without a subcommand it prints help. The version comes from `package.json`. */
export const run = (args: ReadonlyArray<string> = process.argv.slice(2)) =>
  Command.runWith(rootCmd, { version: pkg.version })(normalizeArgs(args)).pipe(
    Effect.provide(cliConfig)
  )
