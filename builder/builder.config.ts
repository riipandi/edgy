import { defineBuilderConfig } from './config.ts'

/**
 * Project-specific settings for the steps Vite does not do. Bundling itself (the server, the
 * browser assets, the Worker) is Vite's, configured in `vite.config.ts` and `vite.worker.config.ts`;
 * `builder/` runs it and then does the rest: obfuscation, the package manifest, the executable bit
 * and the single executable.
 *
 * Flags (override any of the below per run):
 *   pnpm build:node --minify              # also minify the server bundle
 *   pnpm build:node --obfuscate           # javascript-obfuscator
 *   pnpm build:node --minify --obfuscate  # both
 *
 * Commands:
 *   pnpm build:node     # build the server and browser assets into dist/server
 *   pnpm build:worker   # build the Cloudflare Worker and its assets into dist/worker
 *   pnpm compile        # compile a single executable (SEA)
 *
 * `--target=node|workers` selects the runtime (default `node`).
 */
export default defineBuilderConfig({
  minify: false,
  obfuscate: false,
  obfuscatePreset: 'medium',

  // EXPERIMENTAL: Compile a Node.js single-executable application into
  // `dist/edgy`. Enabled by the `compile` command (pnpm compile); `build`
  // leaves it off regardless of this value. The browser assets are embedded
  // automatically; `assets` is for anything else.
  seaConfig: {
    enable: false,
    fileName: 'edgy'
  }
})
