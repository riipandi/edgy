import { defineBuilderConfig } from './config.ts'

/**
 * Project-specific build configuration.
 *
 * `builder/` mirrors Nitro's `node-server` preset: one bundled ESM entry plus a
 * traced `node_modules/` containing only what cannot be bundled.
 */
export default defineBuilderConfig({
  entry: 'src/main.ts',
  outDir: 'dist',
  serverDir: 'server',
  target: 'node24',
  // `external` and `traceDeps` are intentionally left at their defaults:
  // native packages are auto-detected (binding.gyp / prebuilds / *.node) and
  // copied into the output's `node_modules/` instead of being bundled.
  // This project uses `node:sqlite`, so the traced folder stays empty.
  assets: []
})
