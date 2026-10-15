import { defineConfig } from 'vite'
import { appPlugins, NODE_ENTRY, NODE_OUT_DIR } from './builder/vite.ts'

/**
 * The Node target. `pnpm build:node` runs it through `builder/cli.ts`, which adds what Vite does not
 * do (obfuscation, the package manifest) and `pnpm compile` bundles it again as a single executable;
 * `pnpm dev` starts it in middleware mode (`builder/dev.ts`). The Workers target is
 * `vite.worker.config.ts`.
 *
 * `vite build --app` builds the server first and the browser second: Marko learns from the server
 * build which browser entries each page needs, then patches that manifest into the server bundle.
 */
export default defineConfig(({ command }) => ({
  plugins: appPlugins(),
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
