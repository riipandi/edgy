import path from 'node:path'
import { createBuilder, type InlineConfig } from 'vite'
import type { BuilderRuntime } from './config.ts'

/** The Vite configuration file of each target. */
const CONFIG_FILES: Readonly<Record<BuilderRuntime, string>> = {
  node: 'vite.config.ts',
  workers: 'vite.worker.config.ts'
}

/**
 * Runs the whole Vite application build (`vite build --app`): the server and Marko's browser
 * entries, in the order the plugin needs. `overrides` is merged over the configuration file, which
 * is how the executable pass asks for a single CommonJS file without a second configuration.
 */
export const buildWithVite = async (options: {
  readonly rootDir: string
  readonly runtime: BuilderRuntime
  readonly overrides?: InlineConfig
}): Promise<void> => {
  const builder = await createBuilder({
    root: options.rootDir,
    configFile: path.resolve(options.rootDir, CONFIG_FILES[options.runtime]),
    mode: 'production',
    ...options.overrides
  })
  await builder.buildApp()
}
