import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** The minimal `package.json` that makes a built server a valid Node project. */
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
 * What a Node build adds beyond the bundle.
 *
 * - `package.json` is emitted with the server's files, so it is a regular build asset.
 * - The executable bit is set in `closeBundle` of the client environment. Marko patches the server
 *   bundle while the browser side builds, so the server file is final only then. Vite cannot set
 *   file modes, hence the `chmod`.
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
