import { chmodSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { compileExecutable, type CompileResult } from './compiler.ts'
import type { BuilderConfig } from './config.ts'
import { writeText } from './copy.ts'
import { postProcess } from './postprocess.ts'
import { NODE_OUT_DIR, WORKER_OUT_DIR } from './vite.ts'
import { buildWithVite } from './vite_build.ts'

/** Result of a successful build, used by the CLI and tests. */
export interface BuildResult {
  /** The directory holding the server (or Worker) and, in `public/`, the browser assets. */
  readonly serverDir: string
  /** The server entry: `index.mjs` for Node, `index.js` for a Worker. */
  readonly entry: string
  /** Server files emitted (the browser assets are not counted). */
  readonly files: readonly string[]
  readonly bytes: number
  readonly obfuscated: readonly string[]
  /** Present only when `exe` is enabled. */
  readonly executable?: CompileResult
}

/** Every file under `dir`, recursively. */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

/** The emitted server code, which is what obfuscation and the size report are about. */
const serverFiles = (serverDir: string): string[] =>
  walk(serverDir).filter(
    (file) =>
      /\.(mjs|js)$/.test(file) && !file.startsWith(path.join(serverDir, 'public') + path.sep)
  )

/**
 * Builds the project into a deployable directory.
 *
 * Pipeline:
 *
 * 1. Wipe the target's output directory.
 * 2. Vite builds the server (or Worker) and the browser assets (`vite build --app`). A server is
 *    one bundle with its dependencies inlined; for a Worker the Cloudflare plugin also writes the
 *    `wrangler.json` that `wrangler deploy` follows.
 * 3. Optionally obfuscate the server code (post-process, after bundling on purpose: scrambling
 *    the whole bundle renames far more than obfuscating module by module).
 * 4. Node only: mark the entry executable, and emit a `package.json` so the directory is a valid,
 *    runnable Node project.
 * 5. When `exe` is on, additionally build a Node single-executable application
 *    (**experimental**) into `<outDir>/<exeFileName>`.
 */
export const runBuild = async (config: BuilderConfig): Promise<BuildResult> => {
  const outDir = config.runtime === 'node' ? NODE_OUT_DIR : WORKER_OUT_DIR
  const serverDir = path.resolve(config.rootDir, outDir)

  rmSync(serverDir, { recursive: true, force: true })

  // Read by `vite.worker.config.ts`, which runs in this process.
  if (config.local) process.env['EDGY_LOCAL'] = '1'

  await buildWithVite({
    rootDir: config.rootDir,
    runtime: config.runtime,
    overrides: { environments: { ssr: { build: { minify: config.minify ? 'oxc' : false } } } }
  })

  const files = serverFiles(serverDir)
  const { obfuscated } = postProcess({ config, files })

  const entry = path.join(serverDir, config.runtime === 'node' ? 'index.mjs' : 'index.js')
  const bytes = statSync(entry).size

  if (config.runtime === 'node') {
    // The Node entry starts with a shebang (see `vite.config.ts`), so it is a runnable script:
    // `./dist/server/index.mjs serve`. A Worker entry has none and is loaded by the platform.
    // Done after post-processing, which rewrites the files it touches.
    chmodSync(entry, 0o755)
    writePackageJson(serverDir)
  }

  const executable = config.seaConfig.enable ? await compileExecutable({ config }) : undefined

  return {
    serverDir,
    entry,
    files: files.map((file) => path.relative(config.rootDir, file)),
    bytes,
    obfuscated,
    ...(executable === undefined ? {} : { executable })
  }
}

/** Emits a minimal `package.json` so `node <serverDir>` works standalone. */
const writePackageJson = (serverDir: string): void => {
  const manifest = { name: 'edgy-server', private: true, type: 'module', main: './index.mjs' }
  writeText(path.join(serverDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
