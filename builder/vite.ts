import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import type { PluginOption } from 'vite'

/**
 * Plugins both targets share: Marko compiles the `.marko` pages and tags (and, in a build, links the
 * browser entry each page needs), vanilla-extract evaluates the `.css.ts` files into class names and
 * one stylesheet.
 */
export const appPlugins = (): PluginOption[] => [marko(), vanillaExtractPlugin()]

/**
 * The Cloudflare plugin refuses a Worker environment whose `resolve.external` is set, and
 * vanilla-extract sets it (for its runtime package) on the SSR environment. A Worker bundles
 * everything, so the setting is dropped for that target; the Node build bundles everything too
 * (`ssr.noExternal`), where it has no effect.
 */
export const releaseSsrExternal = (): PluginOption => ({
  name: 'edgy:release-ssr-external',
  enforce: 'post',
  config(config) {
    if (config.ssr) delete config.ssr.external
  }
})

/** Root of every build output. */
export const DIST_DIR = 'dist'

/** Output of the Node target: the runnable server, with the browser assets in `public/`. */
export const NODE_OUT_DIR = `${DIST_DIR}/server`

/** Output of the Workers target: the Worker module, with the browser assets in `public/`. */
export const WORKER_OUT_DIR = `${DIST_DIR}/worker`

/** The server entry the Node target bundles. */
export const NODE_ENTRY = 'src/main.ts'

/**
 * Where the Worker's dev server and preview listen. Vite's own defaults differ (5173 for dev, 4173
 * for preview), so the same app answered on a different port depending on the command; this is the
 * address `pnpm watch:worker` and `pnpm preview` always use, and the port the Node server defaults
 * to (`PORT`). `strictPort` makes a busy port an error, not a silent move to another one.
 */
export const WORKER_ADDRESS = { host: '127.0.0.1', port: 3000, strictPort: true } as const
