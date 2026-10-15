import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { withDefaults } from './platform.ts'

/**
 * How the Worker is built, around the Cloudflare plugin.
 *
 * - `builder.buildApp` builds the server, then the browser, in Marko's order. Vite's default would
 *   build the Worker a second time.
 * - A missing Worker config is reported here, because the Cloudflare plugin's error is unclear.
 */
const workerConfig = (): Plugin => ({
  name: 'edgy:worker',
  config(config) {
    withDefaults(config, {
      builder: {
        async buildApp(builder) {
          const { ssr, client } = builder.environments
          if (ssr !== undefined) await builder.build(ssr)
          if (client !== undefined) await builder.build(client)
        }
      }
    })
  },
  configResolved(config) {
    const found = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].some((name) =>
      existsSync(path.join(config.root, name))
    )
    if (!found) throw new Error('--mode worker needs a wrangler.jsonc in the project root')
  }
})

/**
 * The Cloudflare plugin rejects a Worker environment with `external` set, and vanilla-extract sets
 * it on SSR for its runtime package. A Worker bundles everything, so it is removed.
 */
const releaseSsrExternal = (): Plugin => ({
  name: 'edgy:worker-release-external',
  enforce: 'post',
  config(config) {
    if (config.ssr) delete config.ssr.external
  }
})

/**
 * The server environment emits a copy of each page's stylesheet beside the Worker. Nothing reads
 * it (the pages link the browser build's copy under `public/`, and Wrangler uploads only the
 * Worker's modules and that directory), so it is dropped rather than left in `dist/worker/assets/`.
 */
const dropServerStyles = (): Plugin => ({
  name: 'edgy:worker-drop-server-styles',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'ssr',
  generateBundle(_options, bundle) {
    for (const name of Object.keys(bundle)) {
      if (name.endsWith('.css')) delete bundle[name]
    }
  }
})

/** Everything for the Worker platform. Async, so the Cloudflare plugin loads only when needed. */
export const workerPlatform = async (): Promise<Plugin[]> => {
  // `.env.local` belongs to the Node server. Left on, the Cloudflare plugin copies it over the
  // Worker's `wrangler.jsonc` variables, which can silently change settings such as the rate
  // limiter. Local Worker secrets and overrides go in `.dev.vars`, which Wrangler reads itself.
  process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] ??= 'false'

  // Wrangler writes a debug log per run, by default under the user's home, which a restricted
  // environment (a sandbox, a read-only home) refuses. Kept in the ignored project directory
  // unless the caller chose a place.
  process.env['WRANGLER_LOG_PATH'] ??= path.resolve('.wrangler', 'logs')

  // Imported lazily: loading it costs most of a second and opens a Wrangler log file that a Node
  // run does not need. The lazy import needs Vite's default config loader, since `configLoader:
  // 'runner'` closes its module runner before async factories run.
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  return [
    workerConfig(),
    releaseSsrExternal(),
    dropServerStyles(),
    ...cloudflare({ viteEnvironment: { name: 'ssr' } })
  ]
}
