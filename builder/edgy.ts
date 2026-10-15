import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import type { ConfigEnv, Plugin, PluginOption } from 'vite'
import { nodePlatform } from './node.ts'
import { OUT_DIR, type Platform, platformOf, withDefaults } from './platform.ts'
import { workerPlatform } from './worker.ts'

/**
 * What the two platforms have in common, which is the shape of the output: the server (or Worker) in
 * one directory and the browser assets in its `public/`; no HTML of Vite's own, because pages are
 * the application's (`appType: 'custom'`).
 *
 * It also settles one thing Marko cannot know: Marko only optimizes templates in Vite's `production`
 * mode, and here a build can be for another mode (`--mode worker`), so a build says so itself. (Marko
 * reads `MARKO_DEBUG`; this sets it before Marko's own configuration hook runs, which is why this
 * plugin comes first.)
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
 * The whole application's Vite setup, as one plugin: `vite.config.ts` is only this call.
 *
 * - **Pages and styles** (every platform): Marko compiles the templates (and, in a build, links the
 *   browser entry each page needs), vanilla-extract turns the `.css.ts` files into class names and
 *   one stylesheet.
 * - **node** (default): `vite` runs the application inside the dev server, `vite build` writes
 *   `dist/server`, `vite preview` runs that build (`./node.ts`).
 * - **worker** (`--mode worker`): the same three commands, for Cloudflare Workers through its Vite
 *   plugin, writing `dist/worker` (`./worker.ts`).
 *
 * It is async because the Cloudflare plugin is loaded only when the Worker is the platform.
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
