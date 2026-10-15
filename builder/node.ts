import type { Plugin } from 'vite'
import { devServerPlugin } from './dev.ts'
import { nodeOutput } from './output.ts'
import { withDefaults } from './platform.ts'
import { nodePreview } from './preview.ts'

/**
 * The Node server is one bundle with every dependency inlined, so it deploys without
 * `node_modules`. Its entry starts with a shebang, and browser assets go in `assets/`.
 *
 * - `ssr.noExternal` applies only to builds. Under `vite` the module runner leaves `node_modules`
 *   to Node.
 * - `builder: {}` builds every environment, the server first. Marko reads the server build to find
 *   each page's browser entries, then patches that manifest into the server bundle.
 * - Server chunks go in `chunks/` so they never collide with the browser's `/assets`.
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
                // Runs as `./dist/server/index.mjs serve`; the mode is set after the build.
                banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : '')
              }
            }
          }
        }
      }
    })
  }
})

/** Everything for the Node platform: build shape, dev server, finished output, preview. */
export const nodePlatform = (): Plugin[] => [
  nodeConfig(),
  devServerPlugin(),
  nodeOutput(),
  nodePreview()
]
