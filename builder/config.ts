import path from 'node:path'

/** A single asset copied verbatim into the build output. */
export interface BuilderAsset {
  /** Path relative to `rootDir` (file or directory). */
  readonly from: string
  /** Path relative to `serverDir` in the output. */
  readonly to: string
}

/** Fully resolved builder configuration. */
export interface BuilderConfig {
  /** Project root. All relative paths are resolved against it. */
  readonly rootDir: string
  /** Server entry point, relative to `rootDir`. */
  readonly entry: string
  /** Build output root, relative to `rootDir`. */
  readonly outDir: string
  /** Directory inside `outDir` that holds the runnable server. */
  readonly serverDir: string
  /** Name of the emitted entry file. */
  readonly entryFileName: string
  /** esbuild `target`, e.g. `node24`. */
  readonly target: string
  /** Minify the emitted bundle. */
  readonly minify: boolean
  /** Emit source maps next to the bundle. */
  readonly sourcemap: boolean
  /** Conditions used when resolving package exports. */
  readonly conditions: readonly string[]
  /** Packages (or patterns) kept external and traced into the output. */
  readonly external: readonly (string | RegExp)[]
  /** Extra packages to trace, on top of auto-detected native ones. */
  readonly traceDeps: readonly (string | RegExp)[]
  /** Asset files/directories copied into `serverDir`. */
  readonly assets: readonly BuilderAsset[]
}

/** User-supplied configuration; everything is optional. */
export type BuilderConfigInput = Partial<BuilderConfig> & { readonly rootDir?: string }

/**
 * Known packages that ship a native addon and therefore cannot be bundled.
 *
 * Kept deliberately short: `builder/` also auto-detects native packages by
 * inspecting `binding.gyp`, `prebuilds/` and `gypfile`, so this list only needs
 * the packages that hide their addon behind a loader.
 */
export const NATIVE_PACKAGES: readonly string[] = [
  'better-sqlite3',
  'bcrypt',
  'canvas',
  'libsql',
  'node-gyp-build',
  'pg-native',
  're2',
  'sharp',
  'sqlite3'
]

/** Built-in defaults, mirroring Nitro's `node-server` preset layout. */
export const BUILDER_DEFAULTS: Omit<BuilderConfig, 'rootDir'> = {
  entry: 'src/main.ts',
  outDir: 'dist',
  serverDir: 'server',
  entryFileName: 'index.mjs',
  target: 'node24',
  minify: false,
  sourcemap: false,
  conditions: ['node', 'import', 'production'],
  external: NATIVE_PACKAGES,
  traceDeps: [],
  assets: []
}

/**
 * Identity helper that gives editors autocomplete and type checking for a
 * builder config file, mirroring `defineNitroConfig` ergonomics.
 */
export const defineBuilderConfig = (input: BuilderConfigInput): BuilderConfigInput => input

/** Merges user input over {@link BUILDER_DEFAULTS} and resolves every path. */
export const resolveBuilderConfig = (input: BuilderConfigInput = {}): BuilderConfig => {
  const rootDir = path.resolve(input.rootDir ?? process.cwd())

  const merged: BuilderConfig = {
    ...BUILDER_DEFAULTS,
    ...input,
    rootDir,
    external: [...new Set(input.external ?? BUILDER_DEFAULTS.external)],
    traceDeps: [...new Set(input.traceDeps ?? BUILDER_DEFAULTS.traceDeps)],
    assets: input.assets ?? BUILDER_DEFAULTS.assets,
    conditions: input.conditions ?? BUILDER_DEFAULTS.conditions
  }

  return {
    ...merged,
    outDir: path.resolve(rootDir, merged.outDir),
    serverDir: path.resolve(rootDir, merged.outDir, merged.serverDir)
  }
}
