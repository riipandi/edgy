import path from 'node:path'
import type { BuildOptions } from 'rolldown'

/** A single asset copied verbatim into the build output. */
export interface BuilderAsset {
  /** Path relative to `rootDir` (file or directory). */
  readonly from: string
  /** Path relative to `serverDir` in the output. */
  readonly to: string
}

/** A named code-splitting group. */
export interface ChunkGroup {
  /**
   * Chunk name; also replaces `[name]` in `chunkFileNames`.
   *
   * A function receives each module id and returns the group name to place it
   * in (or `null`/`undefined` to leave it to the next group). Every distinct
   * returned name becomes its own chunk — this is how {@link BuilderConfig.splitPackages}
   * emits one chunk per dependency.
   */
  readonly name: string | ((moduleId: string) => string | undefined | null)
  /** Regex (or string) matched against module ids. */
  readonly test: RegExp | string
  /** Higher priority wins when groups overlap. Default `0`. */
  readonly priority?: number
  /** Group name used in the bundler timing report for function `name`. */
  readonly debugName?: string
}

/**
 * Options for the Node.js single-executable application (SEA) compiler.
 *
 * Mirrors Node's `sea-config.json` (`node --experimental-sea-config`), plus the
 * builder's own output naming. **Experimental** — Node marks SEA as
 * `Stability: 1.1` and supports a limited platform matrix (Windows, macOS
 * arm64, Linux except Alpine/s390x).
 */
export interface SeaConfig {
  /**
   * Compile a single executable next to the server bundle. Default `false`.
   *
   * A second, single-file CommonJS bundle is produced and injected into a copy
   * of the running `node` binary, yielding an executable that needs no Node.js
   * installed. The result embeds the Node binary (~120 MB) and cannot be
   * cross-compiled — it only runs on the platform that built it.
   */
  readonly enable: boolean
  /** File name of the generated executable, inside `outDir`. Default `edgy`. */
  readonly fileName: string
  /**
   * Suppress Node's experimental SEA warning at startup.
   *
   * @default true
   */
  readonly disableExperimentalSEAWarning: boolean
  /**
   * Bake a V8 code cache into the blob to speed up startup.
   *
   * Forces `false` when {@link target} is a cross-platform build, since a code
   * cache is only valid on the platform that compiled it. Note: `import()` does
   * not work when this is `true`.
   *
   * @default false
   */
  readonly useCodeCache: boolean
  /**
   * Capture a startup snapshot of the main script.
   *
   * Forces `false` on cross-platform builds, for the same reason as
   * {@link useCodeCache}. Requires the main script to call
   * `v8.startupSnapshot.setDeserializeMainFunction()`.
   *
   * @default false
   */
  readonly useSnapshot: boolean
  /**
   * Node.js flags applied automatically when the executable starts.
   *
   * @example ['--no-warnings', '--max-old-space-size=2048']
   */
  readonly execArgv: readonly string[]
  /**
   * How extra execution arguments may be supplied beyond {@link execArgv}.
   * `env` allows `NODE_OPTIONS`; `cli` adds `--node-options=…`; `none` blocks
   * both.
   *
   * @default 'env'
   */
  readonly execArgvExtension: 'none' | 'env' | 'cli'
  /**
   * Assets embedded into the executable, keyed by the name used to read them
   * back via `node:sea`'s `getAsset()`. Paths are relative to `rootDir`.
   */
  readonly assets: Readonly<Record<string, string>>
  /**
   * Target `platform-arch` for a cross-platform build (e.g. `linux-x64`).
   *
   * The blob must be produced by a `node` binary for that platform; the builder
   * uses it to decide whether code cache and snapshot are safe, and to label
   * the output. Defaults to the host (`process.platform-process.arch`).
   */
  readonly target?: string
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
  /**
   * Pattern for split chunks, relative to `serverDir`. Chunk names are
   * flattened (path separators become `-`), so the output never nests — e.g.
   * `@effect/platform-node` becomes `chunks/@effect-platform-node-<hash>.mjs`.
   */
  readonly chunkFileNames: string
  /** rolldown `platform`, e.g. `node`. */
  readonly platform: 'node' | 'browser' | 'neutral'
  /** Output `target` language level, e.g. `node24`. */
  readonly target: string
  /** Split shared code into chunks instead of one `index.mjs`. Default `true`. */
  readonly splitting: boolean
  /**
   * Emit **one chunk per dependency** during splitting (e.g. `h3`, `effect`,
   * `kysely` instead of a single `vendor`). Only used when `splitting` is on.
   * Default `true`.
   */
  readonly splitPackages: boolean
  /** Chunk groups applied during splitting, before the built-in `vendor` group. */
  readonly chunkGroups: readonly ChunkGroup[]
  /** Minify the emitted bundles. Off by default. */
  readonly minify: boolean
  /** Obfuscate the emitted bundles. Off by default. */
  readonly obfuscate: boolean
  /** Obfuscator preset name; only used when `obfuscate` is on. */
  readonly obfuscatePreset: 'low' | 'medium' | 'high'
  /** Emit source maps next to the bundles. */
  readonly sourcemap: boolean
  /** Conditions used when resolving package exports. */
  readonly conditions: readonly string[]
  /** Packages (or patterns) kept external and traced into the output. */
  readonly external: readonly (string | RegExp)[]
  /** Asset files/directories copied into `serverDir`. */
  readonly assets: readonly BuilderAsset[]
  /**
   * Node single-executable application (SEA) options. Disabled by default.
   *
   * @see {@link SeaConfig}
   */
  readonly seaConfig: SeaConfig
  /**
   * Escape hatch merged into the rolldown config (deep-merged over the
   * builder's own options). Use it for anything not surfaced as a first-class
   * field — extra plugins, `resolve.alias`, `define`, `treeshake`, a custom
   * `output` (e.g. `minify` tuning or `comments`), and so on.
   */
  readonly rolldownOptions: BuildOptions
}

/** User-supplied configuration; everything is optional. */
export type BuilderConfigInput = Omit<Partial<BuilderConfig>, 'seaConfig'> & {
  readonly rootDir?: string
  /** Partial so a caller only states the SEA options they care about. */
  readonly seaConfig?: Partial<SeaConfig>
}

/**
 * Known packages that ship a native addon and therefore cannot be bundled.
 *
 * Kept deliberately short: the builder also auto-detects native packages by
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

/**
 * Built-in defaults, mirroring Nitro's `node-server` preset layout.
 *
 * `splitting` is **on by default**; set it to `false` (or pass `--no-splitting`)
 * to emit one self-contained `index.mjs`. When splitting is on,
 * `splitPackages` is also **on by default**, emitting one chunk per dependency;
 * set it to `false` to fall back to a single `vendor` chunk.
 *
 * `minify` and `obfuscate` are **off by default** — turn them on per project or
 * with the `--minify` / `--obfuscate` CLI flags.
 */
export const BUILDER_DEFAULTS: Omit<BuilderConfig, 'rootDir'> = {
  entry: 'src/main.ts',
  outDir: 'dist',
  serverDir: 'server',
  entryFileName: 'index.mjs',
  chunkFileNames: 'chunks/[name]-[hash].mjs',
  platform: 'node',
  target: 'node24',
  splitting: true,
  splitPackages: true,
  chunkGroups: [],
  minify: false,
  obfuscate: false,
  obfuscatePreset: 'medium',
  sourcemap: false,
  conditions: ['node', 'import', 'production'],
  external: NATIVE_PACKAGES,
  assets: [],
  seaConfig: {
    enable: false,
    fileName: 'edgy',
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    execArgv: [],
    execArgvExtension: 'env',
    assets: {}
  },
  rolldownOptions: {}
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
    assets: input.assets ?? BUILDER_DEFAULTS.assets,
    chunkGroups: input.chunkGroups ?? BUILDER_DEFAULTS.chunkGroups,
    conditions: input.conditions ?? BUILDER_DEFAULTS.conditions,
    seaConfig: { ...BUILDER_DEFAULTS.seaConfig, ...input.seaConfig }
  }

  return {
    ...merged,
    outDir: path.resolve(rootDir, merged.outDir),
    serverDir: path.resolve(rootDir, merged.outDir, merged.serverDir)
  }
}
