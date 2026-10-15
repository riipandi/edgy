import { Effect, FileSystem, Path } from 'effect'
import { Flag } from 'effect/cli'
import { confirmDestructive, ensure, print } from './helper.ts'

/**
 * The flags of a command that writes a file the repository derives from code: where, whether to
 * only check it, and how to replace one that differs.
 */
export const generatedFileFlags = (defaultOutput: string, what: string) => ({
  output: Flag.String('output').pipe(
    Flag.withAlias('o'),
    Flag.withDefault(defaultOutput),
    Flag.withDescription(`File to write${what === '' ? '' : ` (${what})`}`)
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
})

export interface GeneratedFile {
  readonly output: string
  readonly check: boolean
  readonly overwrite: boolean
  readonly force: boolean
  readonly stdout: boolean
  readonly content: string
  /** The command that regenerates it, for the "stale" message. */
  readonly regenerate: string
  /** A reason to refuse writing a file with this name, or `undefined`. */
  readonly refuse?: (name: string) => string | undefined
  /** What to say after a write, e.g. `46 variables`. */
  readonly summary?: string
}

/**
 * Writes `content` to `output`, or checks it. Replacing a file that differs needs `--overwrite`
 * and a confirmation (`--force` skips the prompt). `--check` writes nothing and fails when the file
 * is missing or stale, for a pre-commit hook or CI.
 */
export const writeGenerated = (file: GeneratedFile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    if (file.stdout) {
      yield* print(file.content.trimEnd())
      return
    }

    yield* ensure(!file.force || file.overwrite, '--force only applies together with --overwrite')

    const target = path.resolve(file.output)
    const refusal = file.refuse?.(path.basename(target))
    yield* ensure(refusal === undefined, `Refusing to write ${file.output}: ${refusal}`)

    const existing = (yield* fs.exists(target)) ? yield* fs.readFileString(target) : undefined
    const upToDate = existing === file.content

    if (file.check) {
      yield* ensure(
        upToDate,
        `${file.output} is ${existing === undefined ? 'missing' : 'out of date'}; run \`${file.regenerate}\``
      )
      yield* print(`${file.output} is up to date`)
      return
    }

    if (upToDate) {
      yield* print(`${file.output} is already up to date`)
      return
    }

    if (existing !== undefined) {
      yield* ensure(
        file.overwrite,
        `${file.output} already exists and differs; pass --overwrite to replace it (or --check to see whether it is stale)`
      )
      const confirmed = yield* confirmDestructive(file.force, `Overwrite ${file.output}?`)
      if (!confirmed) return
    }

    yield* fs.writeFileString(target, file.content)
    yield* print(`Wrote ${file.output}${file.summary === undefined ? '' : ` (${file.summary})`}`)
  })
