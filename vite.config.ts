import { defineConfig } from 'vite'
import { buildSteps } from './builder/plugin_build.ts'
import { devServerPlugin } from './builder/plugin_dev.ts'
import { appPlugins, NODE_ENTRY, NODE_OUT_DIR } from './builder/vite.ts'

/**
 * The Node target. `pnpm dev` is `vite`: the application runs inside the dev server
 * (`builder/plugin_dev.ts`). `pnpm build:node` is `vite build --app`, and `pnpm compile` builds it
 * again as a single executable (`builder/compile.ts`). The Workers target is `vite.worker.config.ts`.
 *
 * `vite build --app` builds the server first and the browser second: Marko learns from the server
 * build which browser entries each page needs, then patches that manifest into the server bundle.
 */
export default defineConfig(({ command }) => ({
  // `vite` runs the application inside the dev server; `vite build --app` builds it and then runs
  // the steps Vite does not do (obfuscation, the executable bit, `package.json`).
  plugins: [...appPlugins(), command === 'serve' ? devServerPlugin() : buildSteps()],
  // A server that needs `node_modules` next to it is not a deployable artifact: a build bundles
  // everything. `pnpm dev` leaves dependencies to Node, so only the application is transformed.
  ssr: { noExternal: command === 'build' ? true : [] },
  builder: {},
  environments: {
    client: { build: { outDir: `${NODE_OUT_DIR}/public` } },
    ssr: {
      build: {
        outDir: NODE_OUT_DIR,
        target: 'node24',
        // Server chunks must not share a name with the public `/assets` the browser requests.
        assetsDir: 'chunks',
        rolldownOptions: {
          input: NODE_ENTRY,
          output: {
            entryFileNames: 'index.mjs',
            // `./dist/server/index.mjs serve` runs as a script; the builder sets the executable bit.
            banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : '')
          }
        }
      }
    }
  }
}))
