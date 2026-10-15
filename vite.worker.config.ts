import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { buildSteps } from './builder/plugin_build.ts'
import { appPlugins, releaseSsrExternal, WORKER_ADDRESS, WORKER_OUT_DIR } from './builder/vite.ts'

// `.env.local` feeds the Node server. Left on, the plugin would also copy it over the Worker's
// `wrangler.jsonc` variables (it once did exactly that, turning the rate limiter off). A Worker's
// local secrets and overrides belong in `.dev.vars`, which Wrangler reads by itself.
process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] ??= 'false'

/**
 * The Workers target: `pnpm watch:worker` serves the source in workerd (Vite's dev server with the
 * Worker running in the SSR environment); `pnpm build:worker` writes `dist/worker` (the Worker and
 * its `wrangler.json`) and `dist/worker/public` (the browser assets, which Cloudflare serves
 * without starting the Worker).
 *
 * The local database is migrated automatically in development and in a local preview
 * (`EDGY_LOCAL=1`, which `pnpm preview` sets); a deployed Worker never is (`wrangler.jsonc`).
 */
export default defineConfig(({ command }) => ({
  plugins: [
    ...appPlugins(),
    releaseSsrExternal(),
    // Only a build has steps (obfuscation with `OBFUSCATE`); the Worker entry gets nothing else.
    ...(command === 'build' ? [buildSteps()] : []),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      config: (config) =>
        command === 'serve' || process.env['EDGY_LOCAL'] === '1'
          ? { vars: { ...config.vars, DATABASE_AUTO_MIGRATE: 'true' } }
          : undefined
    })
  ],
  server: WORKER_ADDRESS,
  preview: WORKER_ADDRESS,
  environments: {
    ssr: { build: { outDir: WORKER_OUT_DIR } },
    client: { build: { outDir: `${WORKER_OUT_DIR}/public` } }
  },
  builder: {
    // Marko's own order (server, then browser) written out: with a custom `buildApp` the Cloudflare
    // plugin would otherwise build the Worker a second time after Marko's pass.
    async buildApp(builder) {
      const { ssr, client } = builder.environments
      if (ssr !== undefined) await builder.build(ssr)
      if (client !== undefined) await builder.build(client)
    }
  }
}))
