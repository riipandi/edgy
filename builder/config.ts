import path from 'node:path'

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

/** What the bundle runs on: a Node.js server, or a Cloudflare Worker. */
export type BuilderRuntime = 'node' | 'workers'

/** Fully resolved builder configuration. */
export interface BuilderConfig {
  /** Project root. All relative paths are resolved against it. */
  readonly rootDir: string
  /** Runtime the bundle is for (`--target=node|workers`). Default `node`. */
  readonly runtime: BuilderRuntime
  /** Minify the server bundle. The browser assets are always minified. Off by default. */
  readonly minify: boolean
  /** Obfuscate the emitted server bundle. Off by default. */
  readonly obfuscate: boolean
  /** Obfuscator preset name; only used when `obfuscate` is on. */
  readonly obfuscatePreset: 'low' | 'medium' | 'high'
  /**
   * A Worker build meant for `pnpm preview`: the local database is migrated automatically
   * (`EDGY_LOCAL`, read by `vite.worker.config.ts`). Never set for a deploy.
   */
  readonly local: boolean
  /**
   * Node single-executable application (SEA) options. Disabled by default.
   *
   * @see {@link SeaConfig}
   */
  readonly seaConfig: SeaConfig
}

/** User-supplied configuration; everything is optional. */
export type BuilderConfigInput = Omit<Partial<BuilderConfig>, 'seaConfig'> & {
  readonly rootDir?: string
  /** Partial so a caller only states the SEA options they care about. */
  readonly seaConfig?: Partial<SeaConfig>
}

/**
 * Built-in defaults. `minify` and `obfuscate` are **off by default**: turn them on per project or
 * with the `--minify` / `--obfuscate` CLI flags.
 */
export const BUILDER_DEFAULTS: Omit<BuilderConfig, 'rootDir'> = {
  runtime: 'node',
  minify: false,
  obfuscate: false,
  obfuscatePreset: 'medium',
  local: false,
  seaConfig: {
    enable: false,
    fileName: 'edgy',
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    execArgv: [],
    execArgvExtension: 'env',
    assets: {}
  }
}

/**
 * Identity helper that gives editors autocomplete and type checking for a
 * builder config file, mirroring `defineNitroConfig` ergonomics.
 */
export const defineBuilderConfig = (input: BuilderConfigInput): BuilderConfigInput => input

/** Merges user input over {@link BUILDER_DEFAULTS}. */
export const resolveBuilderConfig = (input: BuilderConfigInput = {}): BuilderConfig => ({
  ...BUILDER_DEFAULTS,
  ...input,
  rootDir: path.resolve(input.rootDir ?? process.cwd()),
  seaConfig: { ...BUILDER_DEFAULTS.seaConfig, ...input.seaConfig }
})
