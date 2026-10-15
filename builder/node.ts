import type { Plugin } from 'vite'
import { devServerPlugin } from './dev.ts'
import { nodeOutput } from './output.ts'
import { withDefaults } from './platform.ts'
import { nodePreview } from './preview.ts'

/**
 * How the Node server is built: one bundle with every dependency inlined (a server that needs
 * `node_modules` next to it is not a deployable artifact), its entry a script that starts with a
 * shebang, and its browser assets in `public/`.
 *
 * - `ssr.noExternal` only for a build: under `vite` the module runner leaves `node_modules` to Node,
 *   so only the application is transformed.
 * - `builder: {}` makes `vite build` build every environment, the server first and the browser
 *   second: Marko learns from the server build which browser entries each page needs, then patches
 *   that manifest into the server bundle.
 * - Server chunks go in `chunks/`, so they never share a name with the public `/assets` the browser
 *   asks for.
 */
const nodeConfig = (): Plugin => ({
  name: 'edgy:node',
  config(config, { command }) {
    withDefaults(config, {
      ssr: { noExternal: command === 'build' ? true : [] },
      builder: {},
      environments: {
        ssr: {
          build: {
            target: 'node24',
            assetsDir: 'chunks',
            rolldownOptions: {
              input: 'src/main.ts',
              output: {
                entryFileNames: 'index.mjs',
                // `./dist/server/index.mjs serve` runs as a script; `nodeOutput` sets the executable bit.
                banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : '')
              }
            }
          }
        }
      }
    })
  }
})

/** Everything for the Node platform: the build's shape, the dev server, the finished output, the preview. */
export const nodePlatform = (): Plugin[] => [
  nodeConfig(),
  devServerPlugin(),
  nodeOutput(),
  nodePreview()
]
