import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import type { ConfigEnv, Plugin, PluginOption } from 'vite'
import { nodePlatform } from './node.ts'
import { OUT_DIR, type Platform, platformOf, withDefaults } from './platform.ts'
import { workerPlatform } from './worker.ts'

/**
 * Shared by both platforms: the server (or Worker) in one directory and the browser assets in its
 * `public/`. No HTML from Vite, since pages belong to the application (`appType: 'custom'`).
 *
 * Marko optimizes templates only in Vite's `production` mode, but a build can run under another
 * mode (`--mode worker`), so a build sets `MARKO_DEBUG` itself. This plugin comes first so the
 * variable is set before Marko's config hook reads it.
 */
const shared = (platform: Platform): Plugin => ({
  name: 'edgy:shared',
  enforce: 'pre',
  config(config, { command }) {
    if (command === 'build') process.env['MARKO_DEBUG'] ??= 'false'
    withDefaults(config, {
      appType: 'custom',
      environments: {
        client: { build: { outDir: `${OUT_DIR[platform]}/public` } },
        ssr: { build: { outDir: OUT_DIR[platform] } }
      }
    })
  }
})

/**
 * The application's whole Vite setup.
 *
 * - **Pages and styles** (all platforms): Marko compiles templates and, in a build, links each
 *   page's browser entry. vanilla-extract turns `.css.ts` files into class names and a stylesheet.
 * - **node** (default): `vite` runs the dev server, `vite build` writes `dist/server`.
 * - **worker** (`--mode worker`): the same commands for Cloudflare Workers, writing `dist/worker`.
 *
 * Async because the Cloudflare plugin is loaded only for the Worker.
 */
export const edgy = async (env: Pick<ConfigEnv, 'mode'>): Promise<PluginOption[]> => {
  const platform = platformOf(env)
  return [
    shared(platform),
    marko(),
    vanillaExtractPlugin(),
    ...(platform === 'worker' ? await workerPlatform() : nodePlatform())
  ]
}
