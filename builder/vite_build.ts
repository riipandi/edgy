import path from 'node:path'
import { createBuilder, type InlineConfig } from 'vite'

/**
 * Runs the whole Node application build (`vite build --app`) from code: the server first and Marko's
 * browser entries second, in the order the plugin needs. `overrides` is merged over `vite.config.ts`,
 * which is how the executable pass asks for a single CommonJS file without a second configuration.
 * The build's own steps (`plugin_build.ts`) run as they do from the command line.
 */
export const buildWithVite = async (options: {
  readonly rootDir: string
  readonly overrides?: InlineConfig
}): Promise<void> => {
  const builder = await createBuilder({
    root: options.rootDir,
    configFile: path.resolve(options.rootDir, 'vite.config.ts'),
    mode: 'production',
    ...options.overrides
  })
  await builder.buildApp()
}
