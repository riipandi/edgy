import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { type ObfuscatePreset, obfuscateFiles, parseObfuscate } from './postprocess.ts'

/** Writes a file, creating parent directories as needed. */
const writeText = (file: string, contents: string): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

/** Every file under `dir`, recursively. */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

/** What {@link finishBuild} did, for the build log. */
export interface FinishedBuild {
  readonly obfuscated: number
  /** Whether the output is a runnable Node server (made executable, given a `package.json`). */
  readonly executable: boolean
}

/**
 * The steps Vite does not do, run on a finished build in `serverDir`:
 *
 * - **Obfuscation** (`OBFUSCATE`) of the server code (`.js` / `.mjs`; the browser assets in
 *   `public/` are minified by Vite and left alone).
 * - For a Node server (an `index.mjs` is there): `chmod 755`, because the entry starts with a
 *   shebang (`vite.config.ts`) and `./dist/server/index.mjs serve` should run; and a minimal
 *   `package.json`, so the directory is a valid Node project (`node dist/server`). Done after
 *   obfuscation, which rewrites the files it touches. A Worker entry has neither: the platform
 *   loads it, nothing runs it.
 */
export const finishBuild = (options: {
  readonly serverDir: string
  readonly obfuscate: ObfuscatePreset | false
}): FinishedBuild => {
  const { serverDir } = options
  const publicDir = path.join(serverDir, 'public') + path.sep
  const code = walk(serverDir).filter(
    (file) => /\.(mjs|js)$/.test(file) && !file.startsWith(publicDir)
  )
  if (options.obfuscate !== false) obfuscateFiles(code, options.obfuscate)

  const entry = path.join(serverDir, 'index.mjs')
  if (!existsSync(entry))
    return { obfuscated: options.obfuscate === false ? 0 : code.length, executable: false }

  chmodSync(entry, 0o755)
  const manifest = { name: 'edgy-server', private: true, type: 'module', main: './index.mjs' }
  writeText(path.join(serverDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { obfuscated: options.obfuscate === false ? 0 : code.length, executable: true }
}

/**
 * Runs {@link finishBuild} once the whole application build is done. `vite build --app` builds the
 * server and then the browser assets, and Marko patches the server bundle while the browser side
 * is built, so the last thing to finish (the client environment's `closeBundle`) is the first
 * moment the server files are final.
 *
 * `OBFUSCATE=low|medium|high` turns obfuscation on; minification is Vite's own `--minify`.
 */
export const buildSteps = (): Plugin => {
  let serverDir = ''
  return {
    name: 'edgy:build-steps',
    apply: 'build',
    configResolved(config) {
      serverDir = path.resolve(
        config.root,
        config.environments['ssr']?.build.outDir ?? config.build.outDir
      )
    },
    closeBundle() {
      if (this.environment.name !== 'client') return
      const done = finishBuild({ serverDir, obfuscate: parseObfuscate(process.env['OBFUSCATE']) })
      this.environment.logger.info(
        `[edgy] ${done.executable ? 'entry made executable' : 'worker entry left as is'}${
          done.obfuscated > 0 ? `, ${done.obfuscated} file(s) obfuscated` : ''
        }`
      )
    }
  }
}
