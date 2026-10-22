import { Effect } from 'effect'
import { CliConfig, Command, Flag, GlobalFlag } from 'effect/cli'
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

const builtIns = GlobalFlag.BuiltIns.map((builtIn) => {
  if (
    builtIn === GlobalFlag.Wizard ||
    builtIn === GlobalFlag.Completions ||
    builtIn === GlobalFlag.LogLevel
  ) {
    return Object.assign({}, builtIn, {
      flag: Flag.withHidden(builtIn.flag as never)
    }) as GlobalFlag.BuiltIn
  }
  return builtIn
})

const cliConfig = CliConfig.layer({ builtIns })

/** Root CLI program. Without a subcommand it prints help. The version comes from `package.json`. */
export const run = Command.run(rootCmd, { version: pkg.version }).pipe(Effect.provide(cliConfig))

/** The same program over explicit arguments, instead of the process's. */
export const runWith = (args: ReadonlyArray<string>) => {
  return Command.runWith(rootCmd, { version: pkg.version })(args).pipe(Effect.provide(cliConfig))
}
