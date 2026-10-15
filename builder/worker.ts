import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { withDefaults } from './platform.ts'

/**
 * How the Worker is built and run: through the Cloudflare plugin, with the pieces it needs around it.
 *
 * - `builder.buildApp` writes Marko's order out (server, then browser). With the Cloudflare plugin
 *   present, Vite's default would build the Worker a second time after Marko's pass.
 * - A missing `wrangler.jsonc` is said plainly, before the Cloudflare plugin fails less clearly.
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
 * The Cloudflare plugin refuses a Worker environment whose `resolve.external` is set, and
 * vanilla-extract sets it (for its runtime package) on the SSR environment. A Worker bundles
 * everything, so the setting is dropped.
 */
const releaseSsrExternal = (): Plugin => ({
  name: 'edgy:worker-release-external',
  enforce: 'post',
  config(config) {
    if (config.ssr) delete config.ssr.external
  }
})

/** Everything for the Worker platform. Async: the Cloudflare plugin is loaded only when it is needed. */
export const workerPlatform = async (): Promise<Plugin[]> => {
  // `.env.local` feeds the Node server. Left on, the Cloudflare plugin would also copy it over the
  // Worker's `wrangler.jsonc` variables (it once did exactly that, turning the rate limiter off). A
  // Worker's local secrets and overrides belong in `.dev.vars`, which Wrangler reads by itself.
  process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] ??= 'false'

  // Loaded only here: importing it costs most of a second and opens a Wrangler log file, which a
  // Node run has no use for. (A lazy import needs Vite's default config loader; `configLoader:
  // 'runner'` closes its module runner before an async plugin factory gets to run.)
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  return [workerConfig(), releaseSsrExternal(), ...cloudflare({ viteEnvironment: { name: 'ssr' } })]
}
