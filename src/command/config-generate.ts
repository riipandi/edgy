import { Effect, FileSystem, Path } from 'effect'
import { Command, Flag } from 'effect/cli'
import { renderExample } from '../kernel/config/example.ts'
import { appConfig } from '../kernel/config/service.ts'
import { confirmDestructive, ensure, print } from './helper.ts'

/** Real dotenv files hold secrets and local overrides, so they are never written. */
const isRealDotenv = (name: string): boolean =>
  /^\.env(\..+)?$/.test(name) && name !== '.env.example'

/**
 * Writes `.env.example` from the declarations the parser reads, so the two cannot drift.
 * Replacing a differing file needs `--overwrite` and a confirmation (`--force` skips the prompt).
 * `--check` writes nothing and fails when the file is missing or stale, for a pre-commit hook or CI.
 */
export const configGenerateCmd = Command.make(
  'config:generate',
  {
    output: Flag.String('output').pipe(
      Flag.withAlias('o'),
      Flag.withDefault('.env.example'),
      Flag.withDescription('File to write (never a real .env file)')
    ),
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Do not write; exit with an error if the file is missing or stale')
    ),
    overwrite: Flag.Boolean('overwrite').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Replace an existing file whose content differs (asks for confirmation)')
    ),
    force: Flag.Boolean('force').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Skip the confirmation prompt of --overwrite')
    ),
    stdout: Flag.Boolean('stdout').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Print the generated file instead of writing it')
    )
  },
  (options) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const content = renderExample(appConfig.specs)

      if (options.stdout) {
        yield* print(content.trimEnd())
        return
      }

      yield* ensure(
        !options.force || options.overwrite,
        '--force only applies together with --overwrite'
      )

      const target = path.resolve(options.output)
      yield* ensure(
        !isRealDotenv(path.basename(target)),
        `Refusing to write ${options.output}: real dotenv files are never generated`
      )

      const existing = (yield* fs.exists(target)) ? yield* fs.readFileString(target) : undefined
      const upToDate = existing === content

      if (options.check) {
        yield* ensure(
          upToDate,
          `${options.output} is ${existing === undefined ? 'missing' : 'out of date'}; run \`pnpm app config:generate\``
        )
        yield* print(`${options.output} is up to date`)
        return
      }

      if (upToDate) {
        yield* print(`${options.output} is already up to date`)
        return
      }

      if (existing !== undefined) {
        yield* ensure(
          options.overwrite,
          `${options.output} already exists and differs; pass --overwrite to replace it (or --check to see whether it is stale)`
        )
        const confirmed = yield* confirmDestructive(options.force, `Overwrite ${options.output}?`)
        if (!confirmed) return
      }

      yield* fs.writeFileString(target, content)
      yield* print(`Wrote ${options.output} (${appConfig.specs.length} variables)`)
    })
).pipe(Command.withDescription('Generate .env.example from the application configuration'))
