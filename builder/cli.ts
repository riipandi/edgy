#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBuild } from './build.ts'
import { resolveBuilderConfig, type BuilderConfigInput } from './config.ts'

const CONFIG_CANDIDATES = ['builder.config.ts', 'builder.config.mjs', 'builder.config.js']

/**
 * Loads `builder/builder.config.ts` (or `.js` / `.mjs`) when present.
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
  const userConfig = await loadUserConfig(rootDir)
  const config = resolveBuilderConfig({ ...userConfig, rootDir })

  const started = Date.now()
  process.stdout.write(`Building server (target: ${config.target})\n`)

  const result = await runBuild(config)

  const size = (result.bytes / 1024).toFixed(1)
  const externals = result.externals.length === 0 ? 'none' : result.externals.join(', ')
  const entry = path.relative(rootDir, result.outFile)

  process.stdout.write(
    [
      `Server built in ${Date.now() - started}ms`,
      `  entry:     ${entry} (${size} kB)`,
      `  externals: ${externals}`,
      `Preview:   node ${entry} serve`
    ].join('\n') + '\n'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
