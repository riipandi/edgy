import { type ConfigEnv, mergeConfig, type UserConfig } from 'vite'

/** What the application is built and run for: a Node.js server, or a Cloudflare Worker. */
export type Platform = 'node' | 'worker'

/**
 * The platform a Vite run is for, chosen with Vite's own `--mode`: `worker` is the Worker, anything
 * else (the default `development` / `production`, or `node`) is the Node server.
 *
 * A mode is the one switch Vite's command line offers that reaches the configuration. It also
 * picks the env files Vite loads (`.env.worker`, `.env.worker.local`), which is what a platform
 * wants. (`--target`, the obvious name, is Vite's language level for `vite build`, and any flag
 * Vite does not know is refused before the configuration is read.)
 */
export const platformOf = (env: Pick<ConfigEnv, 'mode'>): Platform =>
  env.mode === 'worker' ? 'worker' : 'node'

/** Where a platform's build is written: the server (or Worker) and, in `public/`, the browser assets. */
export const OUT_DIR = { node: 'dist/server', worker: 'dist/worker' } as const satisfies Record<
  Platform,
  string
>

/**
 * Applies `defaults` to the configuration a plugin's `config` hook receives, without overriding
 * anything already there. A hook that *returns* its settings wins over the user's file and the
 * command line (that is how Vite merges the two), so a build that asks for another output directory
 * or format (`pnpm compile`) would be ignored; writing defaults underneath keeps every explicit
 * setting in charge, and the plugin's own the fallback.
 */
export const withDefaults = (config: UserConfig, defaults: UserConfig): void => {
  Object.assign(config, mergeConfig(defaults, config))
}
