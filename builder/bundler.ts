import path from 'node:path'
import type { BuildOptions, OutputOptions, Plugin } from 'rolldown'
import { build as rolldownBuild } from 'rolldown'
import type { BuilderConfig, ChunkGroup } from './config.ts'
import type { ExternalPackage } from './externals.ts'
import { classifyExternal, isBuiltin, packageFromPath } from './externals.ts'

/** Options for a bundler run. */
export interface BundleOptions {
  readonly config: BuilderConfig
  readonly externals: Map<string, ExternalPackage>
}

/** What the bundler produced, for build logging. */
export interface BundleResult {
  /** Emitted files, relative to `rootDir`. */
  readonly files: readonly string[]
}

/**
 * Default code-splitting layout.
 *
 * Mirrors what Nitro does with its `manualChunks` hook: everything under
 * `node_modules` goes to a `vendor` chunk while application code stays in the
 * entry. User groups from `config.chunkGroups` are evaluated first.
 */
const DEFAULT_GROUPS: readonly ChunkGroup[] = [{ name: 'vendor', test: /node_modules[\\/]/ }]

/**
 * One chunk per dependency, e.g. `h3`, `effect`, `@effect/platform-node`.
 *
 * Uses a dynamic `name` so every distinct package becomes its own group, and a
 * higher priority than the `vendor` fallback so packages are pulled out of it.
 */
const PER_PACKAGE_GROUP: ChunkGroup = {
  name: (moduleId) => packageFromPath(moduleId),
  test: /node_modules[\\/]/,
  priority: 10,
  debugName: 'per-package'
}

/** Replaces path separators in a chunk name so chunks never nest. */
const flattenChunkName = (name: string): string => name.replace(/[\\/]+/g, '-')

/** Wraps a group so its resolved name can never introduce a directory. */
const flattenGroup = (group: ChunkGroup): ChunkGroup => {
  const { name } = group
  if (typeof name !== 'function') return { ...group, name: flattenChunkName(name) }

  return {
    ...group,
    name: (moduleId: string) => {
      const resolved = name(moduleId)
      return resolved == null ? resolved : flattenChunkName(resolved)
    }
  }
}

/**
 * Resolves the group list for the current config.
 *
 * Order decides precedence for equal priorities, so `splitPackages` (highest
 * priority) wins first, then user groups, then the `vendor` fallback. Names are
 * flattened so the output stays a flat `chunks/` directory.
 */
const chunkGroups = (config: BuilderConfig): readonly ChunkGroup[] =>
  [
    ...(config.splitPackages ? [PER_PACKAGE_GROUP] : []),
    ...config.chunkGroups,
    ...DEFAULT_GROUPS
  ].map(flattenGroup)

/**
 * Keeps builtins, configured packages and auto-detected native packages
 * external, so they stay as bare imports in the output and get traced into
 * `node_modules/` instead of being bundled.
 */
const externalsPlugin = (options: BundleOptions): Plugin => ({
  name: 'builder:externals',
  resolveId(source, importer) {
    if (isBuiltin(source)) return { id: source, external: true }

    const pkg = classifyExternal({
      id: source,
      importer: importer ?? undefined,
      rootDir: options.config.rootDir,
      conditions: options.config.conditions,
      external: options.config.external,
      externals: options.externals
    })

    return pkg ? { id: source, external: true } : null
  }
})

/**
 * Builds the base rolldown config from the first-class builder fields.
 *
 * `config.rolldownOptions` is applied on top by {@link mergeRolldownOptions},
 * so users can extend or override anything here without editing the builder.
 *
 * @param overrides per-run output tweaks (used by the SEA/CJS pass)
 */
const baseRolldownOptions = (
  options: BundleOptions,
  overrides: OutputOptions = {}
): BuildOptions => {
  const { config } = options

  const output: OutputOptions = {
    dir: config.serverDir,
    format: 'es',
    entryFileNames: config.entryFileName,
    chunkFileNames: config.chunkFileNames,
    minify: config.minify,
    sourcemap: config.sourcemap,
    banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : ''),
    codeSplitting: config.splitting ? { groups: [...chunkGroups(config)] } : false,
    ...overrides
  }

  return {
    input: path.resolve(config.rootDir, config.entry),
    platform: config.platform,
    transform: { target: config.target },
    resolve: { conditionNames: [...config.conditions] },
    plugins: [externalsPlugin(options)],
    output
  }
}

/**
 * Recursively merges user `rolldownOptions` over the builder's base config.
 *
 * Arrays are concatenated (so extra `plugins` are appended rather than
 * replacing the externals plugin) and plain objects are merged key by key.
 * Everything else — including functions — is taken from the user value.
 *
 * The merge walks `unknown` values by design, so a single documented assertion
 * restores the `BuildOptions` shape at the boundary. The base config is always
 * complete, so the result satisfies the type.
 */
const mergeRolldownOptions = (base: BuildOptions, override: BuildOptions): BuildOptions => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return mergeRecords(base, override) as BuildOptions
}

const mergeRecords = (base: unknown, override: unknown): unknown => {
  if (Array.isArray(base) && Array.isArray(override)) return [...base, ...override]
  if (!isPlainObject(base) || !isPlainObject(override)) return override

  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeRecords(merged[key], value)
  }
  return merged
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Bundles the server as a **single CommonJS file**, for the SEA pass.
 *
 * Node's single-executable application support only runs one embedded script
 * using the CommonJS module system, so this pass forces `format: 'cjs'` and
 * disables code splitting. `import.meta` is replaced with an empty object
 * (rolldown's default for CJS) — defined explicitly to silence the warning.
 *
 * User `rolldownOptions` is intentionally **not** merged here: those options
 * target the ESM server build, and a stray `format`/`codeSplitting` would break
 * the executable.
 */
export const bundleSea = async (options: BundleOptions & { outFile: string }): Promise<string> => {
  const { config, outFile } = options

  const base = baseRolldownOptions(options, {
    dir: path.dirname(outFile),
    format: 'cjs',
    entryFileNames: path.basename(outFile),
    chunkFileNames: path.basename(outFile),
    codeSplitting: false,
    sourcemap: false,
    banner: () => ''
  })

  await rolldownBuild({
    ...base,
    transform: { target: config.target, define: { 'import.meta': '({})' } }
  })

  return outFile
}

/**
 * Bundles the server with rolldown.
 *
 * Rolldown is rollup-compatible, so shared code can be emitted as real chunks
 * instead of piling into a single `index.mjs`. Set `splitting: false` to force
 * a single self-contained file.
 */
export const bundle = async (options: BundleOptions): Promise<BundleResult> => {
  const { config } = options

  const rolldownOptions = mergeRolldownOptions(baseRolldownOptions(options), config.rolldownOptions)

  const result = await rolldownBuild(rolldownOptions)

  const files = result.output
    .filter((item) => item.type === 'chunk')
    .map((item) => path.relative(config.rootDir, path.join(config.serverDir, item.fileName)))

  return { files }
}
