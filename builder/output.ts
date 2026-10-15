import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** The `package.json` of a built server: a minimal one, so the directory is a valid Node project (`node dist/server`). */
export const packageManifest = (): string =>
  `${JSON.stringify({ name: 'edgy-server', private: true, type: 'module', main: './index.mjs' }, null, 2)}\n`

/**
 * Makes the entry of a built server executable: it starts with a shebang, so
 * `./dist/server/index.mjs serve` should run. `false` when there is no `index.mjs` there.
 */
export const makeExecutable = (serverDir: string): boolean => {
  const entry = path.join(serverDir, 'index.mjs')
  if (!existsSync(entry)) return false
  chmodSync(entry, 0o755)
  return true
}

/**
 * What a Node build needs beyond the bundle:
 *
 * - `package.json` is emitted with the server's other files (`generateBundle` of the SSR
 *   environment), so it is part of the build like any asset.
 * - The executable bit is set once the whole build is done. `vite build` builds the server and then
 *   the browser assets, and Marko patches the server bundle while the browser side is built, so the
 *   last environment to close (the client) is the first moment the server file is final. Vite cannot
 *   set a file mode, hence the one `chmod`.
 */
export const nodeOutput = (): Plugin => {
  let serverDir = ''
  return {
    name: 'edgy:node-output',
    apply: 'build',
    configResolved(config) {
      serverDir = path.resolve(
        config.root,
        config.environments['ssr']?.build.outDir ?? config.build.outDir
      )
    },
    generateBundle() {
      if (this.environment.name !== 'ssr') return
      this.emitFile({ type: 'asset', fileName: 'package.json', source: packageManifest() })
    },
    closeBundle() {
      if (this.environment.name === 'client' && makeExecutable(serverDir)) {
        this.environment.logger.info('[edgy] entry made executable')
      }
    }
  }
}
