#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBuild } from './build.ts'
import { resolveBuilderConfig, type BuilderConfigInput } from './config.ts'

const CONFIG_CANDIDATES = ['builder.config.ts', 'builder.config.mjs', 'builder.config.js']

/** Subcommands understood by this CLI. */
const COMMANDS = ['build', 'compile'] as const

type Command = (typeof COMMANDS)[number]

/** CLI flags that override the config file. */
interface CliFlags {
  readonly minify?: boolean | undefined
  readonly obfuscate?: boolean | undefined
  readonly splitting?: boolean | undefined
}

/** Parsed command line: the subcommand plus its flags. */
interface ParsedArgv {
  readonly command: Command
  readonly flags: readonly string[]
}

const isCommand = (value: string): value is Command =>
  (COMMANDS as readonly string[]).includes(value)

/**
 * Splits `argv` into a subcommand and its flags.
 *
 * The first non-flag argument is the command; it defaults to `build` so a bare
 * `pnpm build` keeps working. Flags are parsed separately so their position
 * relative to the command does not matter.
 */
const parseArgv = (argv: readonly string[]): ParsedArgv => {
  const command = argv.find((arg) => !arg.startsWith('--')) ?? 'build'
  return {
    command: isCommand(command) ? command : 'build',
    flags: argv.filter((arg) => arg.startsWith('--'))
  }
}

/**
 * Parses the small set of supported flags.
 *
 * `--no-<flag>` disables, bare `--<flag>` enables; everything else is ignored.
 */
const parseFlags = (argv: readonly string[]): CliFlags => {
  const has = (name: string) => argv.includes(`--${name}`)
  const negated = (name: string) => argv.includes(`--no-${name}`)
  const toggle = (name: string): boolean | undefined =>
    has(name) ? true : negated(name) ? false : undefined

  return {
    minify: toggle('minify'),
    obfuscate: toggle('obfuscate'),
    splitting: toggle('splitting')
  }
}

/**
 * Drops `undefined` flags so they do not clobber config-file values.
 *
 * Built with conditional spreads because `exactOptionalPropertyTypes` forbids
 * assigning an explicit `undefined` to an optional property.
 */
const definedOnly = (flags: CliFlags): BuilderConfigInput => ({
  ...(flags.minify === undefined ? {} : { minify: flags.minify }),
  ...(flags.obfuscate === undefined ? {} : { obfuscate: flags.obfuscate }),
  ...(flags.splitting === undefined ? {} : { splitting: flags.splitting })
})

/**
 * Loads `builder.config.ts` (or `.js` / `.mjs`) when present.
 *
 * The config file is imported directly — Node 24 strips TypeScript types
 * natively, so no loader or `jiti` is required for our own build config.
 */
const loadUserConfig = async (rootDir: string): Promise<BuilderConfigInput> => {
  for (const name of CONFIG_CANDIDATES) {
    const file = path.join(rootDir, name)
    if (!existsSync(file)) continue

    const loaded: unknown = await import(pathToFileURL(file).href)
    if (isModuleWithDefault(loaded)) return loaded.default
    return {}
  }
  return {}
}

/** Runtime guard for an imported config module. */
const isModuleWithDefault = (value: unknown): value is { default: BuilderConfigInput } =>
  typeof value === 'object' && value !== null && 'default' in value

/**
 * Builds the project.
 *
 * `build` bundles the server only. `compile` additionally turns the result into
 * a Node single-executable application — a much slower, platform-locked step
 * that belongs to release, not to the dev loop. The subcommand is authoritative:
 * it overrides `seaConfig.enable`, so the same config file serves both.
 */
const main = async (): Promise<void> => {
  const rootDir = process.cwd()
  const { command, flags: rawFlags } = parseArgv(process.argv.slice(2))
  const flags = parseFlags(rawFlags)
  const userConfig = await loadUserConfig(rootDir)

  const compileExe = command === 'compile'
  const config = resolveBuilderConfig({
    ...userConfig,
    ...definedOnly(flags),
    rootDir,
    seaConfig: { ...userConfig.seaConfig, enable: compileExe }
  })

  const started = Date.now()
  const extras = [
    config.splitting
      ? config.splitPackages
        ? 'splitting:per-package'
        : 'splitting:vendor'
      : undefined,
    config.minify ? 'minify' : undefined,
    config.obfuscate ? `obfuscate:${config.obfuscatePreset}` : undefined
  ].filter(Boolean)

  const action = compileExe ? 'Compiling server + executable' : 'Building server'
  process.stdout.write(
    `${action} (target: ${config.target}, ${extras.join(' + ') || 'no extras'})\n`
  )

  const result = await runBuild(config)

  const size = (result.bytes / 1024).toFixed(1)
  const entry = path.relative(rootDir, path.join(result.serverDir, config.entryFileName))
  const externals = result.externals.length === 0 ? 'none' : result.externals.join(', ')

  const lines = [
    `Server built in ${Date.now() - started}ms`,
    `  entry:     ${entry} (${size} kB)`,
    `  chunks:    ${result.files.length}`,
    `  externals: ${externals}`,
    `Preview:   node ${entry} serve`
  ]

  if (result.executable) {
    const exe = path.relative(rootDir, result.executable.outputPath)
    const exeSize = (result.executable.bytes / 1024 / 1024).toFixed(1)
    lines.push(
      '',
      `Executable (experimental, ${result.executable.platform}):`,
      `  ${exe} (${exeSize} MB)`,
      `Run:       ./${exe} serve`
    )
  }

  process.stdout.write(lines.join('\n') + '\n')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
