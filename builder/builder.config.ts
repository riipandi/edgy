import { defineBuilderConfig } from './config.ts'

/**
 * Project-specific build configuration.
 *
 * `builder/` mirrors Nitro's `node-server` preset: a bundled ESM entry, shared
 * code split into chunks, plus a traced `node_modules/` containing only what
 * cannot be bundled.
 *
 * Flags (override any of the below per run):
 *   pnpm build:node --no-splitting        # single self-contained index.mjs
 *   pnpm build:node --minify              # oxc minifier
 *   pnpm build:node --obfuscate           # javascript-obfuscator
 *   pnpm build:node --minify --obfuscate  # both minification and obfuscation
 *
 * Commands:
 *   pnpm build:node     # bundle the server into dist/server
 *   pnpm build:worker   # bundle the Cloudflare Worker (src/worker.ts)
 *   pnpm compile        # compile a single executable (SEA)
 *
 * `--target=node|workers` selects the runtime (default `node`). Workers applies
 * `WORKERS_PRESET` (see `config.ts`) over the fields below, so `entry`, `splitting`
 * and `conditions` here describe the Node server only.
 */
export default defineBuilderConfig({
  entry: 'src/main.ts',
  outDir: 'dist',
  serverDir: 'server',
  platform: 'node',
  target: 'node24',

  // Code splitting is on by default: shared code goes to chunks.
  // Set `splitting: false` (or pass --no-splitting) for one big index.mjs.
  splitting: true,
  splitPackages: true,

  // Extra, project-specific chunk groups. `name` may be a function to group
  // dynamically; group names are flattened so chunks never nest. These are
  // evaluated before the built-in `vendor` fallback.
  chunkGroups: [],

  // Both off by default.
  minify: false,
  obfuscate: false,
  obfuscatePreset: 'medium',

  // `external` is left at its default: native packages are auto-detected
  // (binding.gyp / prebuilds / *.node) and copied into the output's
  // `node_modules/` instead of being bundled. This project uses `node:sqlite`,
  // so the traced folder stays empty.
  assets: [],

  // EXPERIMENTAL: Compile a Node.js single-executable application into
  // `dist/edgy`. Enabled by the `compile` command (pnpm compile); `build`
  // leaves it off regardless of this value.
  seaConfig: {
    enable: false,
    fileName: 'edgy'
  },

  // Escape hatch: anything here is deep-merged over the builder's rolldown
  // config (arrays concatenate, so extra `plugins` are appended). Example:
  //
  //   rolldownOptions: {
  //     resolve: { alias: { '#': './src' } },
  //     treeshake: true,
  //     output: { comments: false, minify: { mangle: true } }
  //   }
  rolldownOptions: {}
})
