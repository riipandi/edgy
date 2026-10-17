import { pandacss } from '@pandacss/vite'
import type { ConfigEnv, Plugin, PluginOption } from 'vite'
import { nodePlatform } from './node.ts'
import { CLIENT_DIR, OUT_DIR, type Platform, platformOf, withDefaults } from './platform.ts'
import { workerPlatform } from './worker.ts'

/**
 * Shared by both platforms: the server (or Worker) in one directory and the browser assets in
 * `assets/` beside the Node server, or in the Worker's `public/`. No HTML from Vite, since pages belong to the application (`appType: 'custom'`).
 */
const shared = (platform: Platform): Plugin => ({
  name: 'edgy:shared',
  enforce: 'pre',
  config(config) {
    withDefaults(config, {
      appType: 'custom',
      environments: {
        // The server builds first and empties its directory; the browser build only adds to it.
        // The client entry list is explicit (plan-20261018_0105, D7); until phase 3 lands the
        // first `.tsx` entry, a virtual module keeps the browser build meaningful but empty.
        client: {
          build: {
            outDir: CLIENT_DIR[platform],
            emptyOutDir: CLIENT_DIR[platform] !== OUT_DIR[platform],
            rolldownOptions: { input: { 'no-client-bundles': '\0no-client-bundles.mjs' } }
          }
        },
        ssr: { build: { outDir: OUT_DIR[platform] } }
      }
    })
  }
})

/**
 * The application's whole Vite setup.
 *
 * - **Styles** (all platforms): Panda CSS extracts the styles that `web/` declares into class
 *   names and one stylesheet, which the layer-order file in `web/assets/global.css` carries. The
 *   page renderer is Solid (added by its own phase of plan-20261018_0105).
 * - **node** (default): `vite` runs the dev server, `vite build` writes `dist/server`.
 * - **worker** (`--mode worker`): the same commands for Cloudflare Workers, writing `dist/worker`.
 *
 * Async because the Cloudflare plugin is loaded only for the Worker.
 */
export const edgy = async (env: Pick<ConfigEnv, 'mode'>): Promise<PluginOption[]> => {
  const platform = platformOf(env)
  return [
    shared(platform),
    noClientBundles(),
    pandacss(),
    ...(platform === 'worker' ? await workerPlatform() : nodePlatform())
  ]
}

/**
 * The placeholder the browser build compiles while no page has declared a client entry yet
 * (plan-20261018_0105 phase 3 replaces it with real entries).
 */
const noClientBundles = (): Plugin => ({
  name: 'edgy:no-client-bundles',
  enforce: 'pre',
  resolveId(id) {
    return id === '\0no-client-bundles.mjs' ? id : null
  },
  load(id) {
    return id === '\0no-client-bundles.mjs' ? 'export const NO_CLIENT_BUNDLES = true' : null
  }
})
