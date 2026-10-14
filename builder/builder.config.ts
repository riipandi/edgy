import { defineBuilderConfig } from './config.ts'

/**
 * Project-specific build configuration.
 *
 * `builder/` mirrors Nitro's `node-server` preset: a bundled ESM entry, shared
 * code split into chunks, plus a traced `node_modules/` containing only what
 * cannot be bundled.
 *
 * Flags (override any of the below per run):
 *   pnpm build --no-splitting        # single self-contained index.mjs
 *   pnpm build --minify              # oxc minifier
 *   pnpm build --minify --obfuscate  # + javascript-obfuscator
 */
export default defineBuilderConfig({
  entry: 'src/main.ts',
  outDir: 'dist',
  serverDir: 'server',
  platform: 'node',
  target: 'node24',

  // Code splitting is on by default: shared code goes to a `vendor` chunk.
  // Set `splitting: false` (or pass --no-splitting) for one big index.mjs.
  splitting: true,
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
