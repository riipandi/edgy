import { defineBuilderConfig } from './config.ts'

/**
 * Settings for the single executable (`pnpm compile`). Everything else about a build is Vite's:
 * `vite.config.ts` and `vite.worker.config.ts`, with `--minify` for a minified server and
 * `OBFUSCATE=low|medium|high` for an obfuscated one (see `plugin_build.ts`).
 *
 * The browser assets are embedded in the executable automatically; `assets` is for anything else.
 */
export default defineBuilderConfig({
  seaConfig: {
    fileName: 'edgy'
  }
})
