import { rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { bundle } from './bundler.ts'
import type { BuilderConfig } from './config.ts'
import { copyPath, writeText } from './copy.ts'
import type { ExternalPackage } from './externals.ts'
import { postProcess } from './postprocess.ts'
import { traceExternals } from './trace.ts'

/** Result of a successful build, used by the CLI and tests. */
export interface BuildResult {
  readonly serverDir: string
  readonly files: readonly string[]
  readonly bytes: number
  readonly externals: readonly string[]
  readonly obfuscated: readonly string[]
}

/**
 * Builds the project into a self-contained server directory.
 *
 * Pipeline (the lean analogue of Nitro's rollup build):
 *
 * 1. Wipe and recreate `<outDir>/<serverDir>`.
 * 2. Bundle `entry` with rolldown. Native / configured packages are marked
 *    external and left as bare imports; shared code is split into chunks unless
 *    `splitting` is off.
 * 3. Optionally minify (during bundling) and obfuscate (post-process).
 * 4. Copy every traced external into `<serverDir>/node_modules`.
 * 5. Copy declared assets (e.g. a `migrations/` folder) into the output.
 * 6. Emit a `package.json` so the directory is a valid, runnable Node project.
 */
export const runBuild = async (config: BuilderConfig): Promise<BuildResult> => {
  const externals = new Map<string, ExternalPackage>()

  rmSync(config.serverDir, { recursive: true, force: true })

  const output = await bundle({ config, externals })

  for (const pkg of externals.values()) {
    const label = pkg.reason === 'native' ? 'native' : 'configured'
    process.stdout.write(`  • external (${label}): ${pkg.name}\n`)
  }

  const { obfuscated } = postProcess({ config, files: output.files })
  const entryPath = path.resolve(config.serverDir, config.entryFileName)
  const bytes = statSync(entryPath).size

  const traced = traceExternals({
    externals,
    serverDir: config.serverDir,
    conditions: config.conditions
  })

  for (const asset of config.assets) {
    copyPath(path.resolve(config.rootDir, asset.from), path.resolve(config.serverDir, asset.to))
  }

  writePackageJson(
    config,
    [...externals.values()].map((pkg) => pkg.name)
  )

  return {
    serverDir: config.serverDir,
    files: output.files,
    bytes,
    externals: traced.packages,
    obfuscated
  }
}

/** Emits a minimal `package.json` so `node <serverDir>` works standalone. */
const writePackageJson = (config: BuilderConfig, externals: readonly string[]): void => {
  const manifest = {
    name: 'edgy-server',
    private: true,
    type: 'module',
    main: `./${config.entryFileName}`,
    dependencies: Object.fromEntries(externals.map((name) => [name, '*']))
  }
  writeText(path.join(config.serverDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
