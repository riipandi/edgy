import { pandacss } from '@pandacss/vite'
import solidPlugin from '@solidjs/vite-plugin'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ConfigEnv, Plugin, PluginOption } from 'vite'
import { nodePlatform } from './node.ts'
import { CLIENT_DIR, OUT_DIR, type Platform, platformOf, withDefaults } from './platform.ts'
import { workerPlatform } from './worker.ts'

/**
 * The browser build's entry list is explicit (plan-20261018_0105, D7): every interactive page
 * declares a `client.tsx` beside it and the list below names it. A page without one stays static.
 */
const clientEntries: Record<string, string> = {
  'users-page': 'web/pages/users/client.tsx'
}

/**
 * Reads what the browser build wrote (`manifest.json` in the output directory). Absent in
 * development — there is no build, and the define stays empty so pages link no built assets.
 */
const readManifestDefine = async (outDir: string): Promise<Record<string, string>> => {
  const file = path.join(outDir, 'manifest.json')
  const raw = await readFile(file, 'utf8').catch(() => '{}')
  return { __EDGY_CLIENT_MANIFEST__: raw.trim() === '' ? '{}' : raw }
}

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
        client: {
          build: {
            outDir: CLIENT_DIR[platform],
            emptyOutDir: CLIENT_DIR[platform] !== OUT_DIR[platform],
            rolldownOptions: { input: clientEntries }
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
 * - **Pages and styles** (all platforms): Solid compiles the `.tsx` pages (SSR transforms on,
 *   entries provided by the application — no start mode), and Panda CSS extracts the styles that
 *   `web/` declares into class names and one stylesheet, which the layer-order file in
 *   `web/assets/global.css` carries. `web/` is named explicitly: the plugin's default include
 *   only covers `src/`.
 * - **node** (default): `vite` runs the dev server, `vite build` writes `dist/server`.
 * - **worker** (`--mode worker`): the same commands for Cloudflare Workers, writing `dist/worker`.
 *
 * Async because the Cloudflare plugin is loaded only for the Worker.
 */
/**
 * Emits `assets/manifest.json` beside the browser bundle: one map from an entry's logical name
 * (`users-page`) to its built script, plus every stylesheet the entry pulled in. The server
 * bundle reads it (through `web/manifest.ts`) to resolve the hashed names pages link in their
 * `<head>` — Vite's own manifest does not reach the server bundle because `ssr.noExternal` cannot
 * import a build-time file.
 */
const clientManifest = (): Plugin => ({
  name: 'edgy:client-manifest',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  generateBundle(_options, bundle) {
    const manifest: Record<string, { script?: string; styles: string[] }> = {}
    for (const [name, source] of Object.entries(clientEntries)) {
      const chunk = Object.values(bundle).find(
        (file): file is Extract<typeof file, { type: 'chunk' }> =>
          file.type === 'chunk' &&
          typeof file.facadeModuleId === 'string' &&
          file.facadeModuleId.includes(source) &&
          file.isEntry
      )
      if (chunk === undefined) continue
      const styles = Object.values(bundle)
        .filter(
          (file): file is Extract<typeof file, { type: 'asset' }> =>
            file.type === 'asset' &&
            file.fileName.endsWith('.css') &&
            // The entry's own CSS carries the chunk's name prefix (`users-page-<hash>.css`).
            typeof file.name === 'string' &&
            file.name.startsWith(chunk.name ?? '')
        )
        .map((file) => `/${file.fileName}`)
      manifest[name] = { script: `/${chunk.fileName}`, styles }
    }
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: JSON.stringify(manifest, null, 2)
    })
  }
})

export const edgy = async (env: Pick<ConfigEnv, 'mode' | 'command'>): Promise<PluginOption[]> => {
  const platform = platformOf(env)
  const manifestDefine = await serverManifestDefine(env.command ?? 'serve', env.mode)
  return [
    shared(platform),
    clientManifest(),
    solidPlugin({ ssr: true, include: ['src/**/*.{tsx,ts}', 'web/**/*.{tsx,ts}'] }),
    pandacss(),
    ...(platform === 'worker' ? await workerPlatform(manifestDefine) : nodePlatform(manifestDefine))
  ]
}

/**
 * The define the server build needs for the renderer's manifest constant: the manifest the
 * browser build wrote, inlined as a constant. Node keeps it in `dist/server` (the client build
 * shares the directory); the Worker keeps it under `dist/worker/public`. A stale file from a
 * previous build serves the server build, which runs first — its own build refreshes the file
 * for the next one, and the hashed names only go stale with a code change that rebuilds both.
 */
export const serverManifestDefine = async (command: string, mode: string) => {
  if (command !== 'build') return {}
  const platform = platformOf({ mode })
  return readManifestDefine(platform === 'worker' ? CLIENT_DIR[platform] : OUT_DIR[platform])
}
