import { type ConfigEnv, mergeConfig, type UserConfig } from 'vite'

/** What the application is built and run for: a Node.js server, or a Cloudflare Worker. */
export type Platform = 'node' | 'worker'

/**
 * The platform of a Vite run, chosen with `--mode`: `worker` is the Worker, anything else is Node.
 *
 * A mode is the only switch that reaches the configuration from Vite's command line, and it also
 * selects the env files (`.env.worker`, `.env.worker.local`). `--target` cannot serve this purpose:
 * it is Vite's language level for `vite build`.
 */
export const platformOf = (env: Pick<ConfigEnv, 'mode'>): Platform =>
  env.mode === 'worker' ? 'worker' : 'node'

/** Output directory per platform: the server or Worker, with browser assets in `public/`. */
export const OUT_DIR = { node: 'dist/server', worker: 'dist/worker' } as const satisfies Record<
  Platform,
  string
>

/**
 * Applies `defaults` under the configuration a `config` hook receives, so explicit settings win.
 * A returned config would override the user's file and the command line, which would ignore
 * a build such as `pnpm compile` asking for another output directory.
 */
export const withDefaults = (config: UserConfig, defaults: UserConfig): void => {
  Object.assign(config, mergeConfig(defaults, config))
}
