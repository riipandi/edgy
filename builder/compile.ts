#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileExecutable } from './compiler.ts'
import { type BuilderConfigInput, resolveBuilderConfig } from './config.ts'
import { buildWithVite } from './vite_build.ts'

/**
 * `pnpm compile`: the Node build (`vite build --app`, with its own steps: `--minify` and
 * `OBFUSCATE` apply as they do for `pnpm build:node`), then a Node single-executable application
 * from it (experimental; see `compiler.ts`). Only this step is a script of its own, because Vite
 * does not make executables.
 */
const isConfigModule = (value: unknown): value is { default: BuilderConfigInput } =>
  typeof value === 'object' &&
  value !== null &&
  'default' in value &&
  typeof value.default === 'object' &&
  value.default !== null

const loadUserConfig = async (rootDir: string): Promise<BuilderConfigInput> => {
  const file = path.join(rootDir, 'builder', 'builder.config.ts')
  if (!existsSync(file)) return {}
  const loaded: unknown = await import(pathToFileURL(file).href)
  return isConfigModule(loaded) ? loaded.default : {}
}

const main = async (): Promise<void> => {
  const rootDir = process.cwd()
  const config = resolveBuilderConfig({ ...(await loadUserConfig(rootDir)), rootDir })
  const started = Date.now()

  process.stdout.write('Compiling server + executable\n')
  await buildWithVite({
    rootDir,
    overrides: process.argv.includes('--minify')
      ? { environments: { ssr: { build: { minify: 'oxc' } } } }
      : {}
  })
  const executable = await compileExecutable({ config })

  const exe = path.relative(rootDir, executable.outputPath)
  process.stdout.write(
    [
      `Built in ${Date.now() - started}ms`,
      `Executable (experimental, ${executable.platform}):`,
      `  ${exe} (${(executable.bytes / 1024 / 1024).toFixed(1)} MB)`,
      `Run:       ./${exe} serve`
    ].join('\n') + '\n'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
