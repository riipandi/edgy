#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBuild } from './build.ts'
import { resolveBuilderConfig, type BuilderConfigInput } from './config.ts'

const CONFIG_CANDIDATES = ['builder.config.ts', 'builder.config.mjs', 'builder.config.js']

/** CLI flags that override the config file. */
interface CliFlags {
  readonly minify?: boolean | undefined
  readonly obfuscate?: boolean | undefined
  readonly splitting?: boolean | undefined
  readonly exe?: boolean | undefined
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
    splitting: toggle('splitting'),
    exe: toggle('exe')
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
  ...(flags.splitting === undefined ? {} : { splitting: flags.splitting }),
  ...(flags.exe === undefined ? {} : { seaConfig: { enable: flags.exe } })
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

/** Entry point used by the `build` npm script. */
const main = async (): Promise<void> => {
  const rootDir = process.cwd()
  const flags = parseFlags(process.argv.slice(2))
  const userConfig = await loadUserConfig(rootDir)
  const config = resolveBuilderConfig({ ...userConfig, ...definedOnly(flags), rootDir })

  const started = Date.now()
  const extras = [
    config.splitting
      ? config.splitPackages
        ? 'splitting:per-package'
        : 'splitting:vendor'
      : undefined,
    config.minify ? 'minify' : undefined,
    config.obfuscate ? `obfuscate:${config.obfuscatePreset}` : undefined,
    config.seaConfig.enable ? 'exe (experimental)' : undefined
  ].filter(Boolean)

  process.stdout.write(
    `Building server (target: ${config.target}, ${extras.join(' + ') || 'no extras'})\n`
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
