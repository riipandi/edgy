import { Console, Effect, FileSystem, Option, Path } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { appConfig } from '#/kernel/config/config.ts'
import { renderExample } from '#/kernel/config/example.ts'
import { confirmDestructive } from './helper.ts'

const DEFAULT_OUTPUT = '.env.example'
const REGENERATE = 'vpr app generate:config'
const REFUSAL = 'real dotenv files are never generated'

const isRealDotenv = (name: string): boolean =>
  /^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== DEFAULT_OUTPUT

/** How many links a path may traverse before the chain is treated as a loop. */
const MAX_LINK_DEPTH = 32

/**
 * Follows the symbolic links starting at `target` and returns the path the chain
 * ends at — a dangling link included, since writing through it creates the file
 * it names.
 */
const resolveLinkChain = (target: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    let current = target
    for (let depth = 0; depth < MAX_LINK_DEPTH; depth++) {
      const link = yield* fs.readLink(current).pipe(Effect.option)
      if (Option.isNone(link)) return current
      current = path.resolve(path.dirname(current), link.value)
    }
    return current
  })

const ensure = (condition: boolean, message: string) =>
  condition
    ? Effect.void
    : Effect.fail(new CliError.UserError({ cause: message, userMessage: message }))

const generateExampleFile = (options: {
  readonly output: string
  readonly check: boolean
  readonly overwrite: boolean
  readonly force: boolean
  readonly stdout: boolean
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const content = renderExample(appConfig.specs)

    yield* ensure(!(options.stdout && options.check), '--stdout cannot be combined with --check')

    if (options.stdout) {
      yield* Console.log(content.trimEnd())
      return
    }

    const target = path.resolve(options.output)
    const resolved = path.basename(yield* resolveLinkChain(target))
    yield* ensure(!isRealDotenv(resolved), `Refusing to write ${options.output}: ${REFUSAL}`)

    const exists = yield* fs.exists(target)
    const existing = exists ? yield* fs.readFileString(target) : undefined
    const upToDate = existing === content

    if (options.check) {
      yield* ensure(
        upToDate,
        `${options.output} is ${existing === undefined ? 'missing' : 'out of date'}; run \`${REGENERATE}\``
      )
      yield* Console.log(`${options.output} is up to date`)
      return
    }

    if (upToDate) {
      yield* Console.log(`${options.output} is already up to date`)
      return
    }

    if (existing !== undefined) {
      yield* ensure(
        options.overwrite,
        `${options.output} already exists and differs; pass --overwrite to replace it (or --check to see whether it is out of date)`
      )
      const confirmed = yield* confirmDestructive(
        options.force,
        `Overwrite ${options.output}?`,
        `Refusing to overwrite non-interactively without --force (Overwrite ${options.output}?)`
      )
      if (!confirmed) return
    }

    yield* fs.writeFileString(target, content)
    yield* Console.log(`Wrote ${options.output} (${appConfig.specs.length} variables)`)
  })

export const configGenerateCmd = Command.make(
  'generate:config',
  {
    output: Flag.String('output').pipe(
      Flag.withAlias('o'),
      Flag.withDefault(DEFAULT_OUTPUT),
      Flag.withDescription(`File to write (default: ${DEFAULT_OUTPUT}; never a real .env file)`)
    ),
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Do not write; exit with an error if the file is missing or out of date')
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
  generateExampleFile
).pipe(Command.withDescription('Generate .env.example from the application configuration'))
