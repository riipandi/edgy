import { Console, Effect, FileSystem, Option, Path } from 'effect'
import { Command } from 'effect/cli'
import { CliError, Flag, Prompt } from 'effect/cli'
import { appConfig } from '#/kernel/config/config.ts'
import { renderExample } from '#/kernel/config/example.ts'

const isRealDotenv = (name: string): boolean =>
  /^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== '.env.example'

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

const generatedFileFlags = (defaultOutput: string, what: string) => ({
  output: Flag.String('output').pipe(
    Flag.withAlias('o'),
    Flag.withDefault(defaultOutput),
    Flag.withDescription(`File to write (default: ${defaultOutput}; ${what})`)
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
})

interface GeneratedFile {
  readonly output: string
  readonly check: boolean
  readonly overwrite: boolean
  readonly force: boolean
  readonly stdout: boolean
  readonly content: string
  readonly regenerate: string
  readonly refuse?: (name: string) => string | undefined
  readonly summary?: string
}

const ensure = (condition: boolean, message: string) =>
  condition
    ? Effect.void
    : Effect.fail(new CliError.UserError({ cause: message, userMessage: message }))

const confirmOverwrite = (force: boolean, message: string) => {
  if (force) return Effect.succeed(true)
  if (!process.stdin.isTTY) {
    return ensure(
      false,
      `Refusing to overwrite non-interactively without --force (${message})`
    ).pipe(Effect.as(false))
  }
  return Effect.gen(function* () {
    const confirmed = yield* Prompt.Confirm({ message, initial: false })
    if (!confirmed) yield* Console.log('Aborted')
    return confirmed
  })
}

const writeGenerated = (file: GeneratedFile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    yield* ensure(!(file.stdout && file.check), '--stdout cannot be combined with --check')

    if (file.stdout) {
      yield* Console.log(file.content.trimEnd())
      return
    }

    const target = path.resolve(file.output)
    const refusal = file.refuse?.(path.basename(yield* resolveLinkChain(target)))
    yield* ensure(refusal === undefined, `Refusing to write ${file.output}: ${refusal}`)

    const exists = yield* fs.exists(target)
    const existing = exists ? yield* fs.readFileString(target) : undefined
    const upToDate = existing === file.content

    if (file.check) {
      yield* ensure(
        upToDate,
        `${file.output} is ${existing === undefined ? 'missing' : 'out of date'}; run \`${file.regenerate}\``
      )
      yield* Console.log(`${file.output} is up to date`)
      return
    }

    if (upToDate) {
      yield* Console.log(`${file.output} is already up to date`)
      return
    }

    if (existing !== undefined) {
      yield* ensure(
        file.overwrite,
        `${file.output} already exists and differs; pass --overwrite to replace it (or --check to see whether it is out of date)`
      )
      const confirmed = yield* confirmOverwrite(file.force, `Overwrite ${file.output}?`)
      if (!confirmed) return
    }

    yield* fs.writeFileString(target, file.content)
    yield* Console.log(
      `Wrote ${file.output}${file.summary === undefined ? '' : ` (${file.summary})`}`
    )
  })

export const configGenerateCmd = Command.make(
  'generate:config',
  generatedFileFlags('.env.example', 'never a real .env file'),
  (options) =>
    writeGenerated({
      ...options,
      content: renderExample(appConfig.specs),
      regenerate: 'vpr app generate:config',
      refuse: (name) => (isRealDotenv(name) ? 'real dotenv files are never generated' : undefined),
      summary: `${appConfig.specs.length} variables`
    })
).pipe(Command.withDescription('Generate .env.example from the application configuration'))
