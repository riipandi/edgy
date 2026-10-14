import path from 'node:path'
import type { BuildOptions, OutputOptions, Plugin } from 'rolldown'
import { build as rolldownBuild } from 'rolldown'
import type { BuilderConfig, ChunkGroup } from './config.ts'
import type { ExternalPackage } from './externals.ts'
import { classifyExternal, isBuiltin } from './externals.ts'

/** Options for a bundler run. */
export interface BundleOptions {
  readonly config: BuilderConfig
  readonly externals: Map<string, ExternalPackage>
}

/** What the bundler produced, for build logging. */
export interface BundleResult {
  /** Emitted files, relative to `rootDir`. */
  readonly files: readonly string[]
  /** Emitted bytes of the entry chunk (0 when unknown). */
  readonly bytes: number
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
 */
const baseRolldownOptions = (options: BundleOptions): BuildOptions => {
  const { config } = options

  const output: OutputOptions = {
    dir: config.serverDir,
    format: 'es',
    entryFileNames: config.entryFileName,
    chunkFileNames: config.chunkFileNames,
    minify: config.minify,
    sourcemap: config.sourcemap,
    banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : ''),
    codeSplitting: config.splitting ? { groups: [...config.chunkGroups, ...DEFAULT_GROUPS] } : false
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

  const entry = result.output.find((item) => item.type === 'chunk' && item.isEntry)

  return { files, bytes: entry?.type === 'chunk' ? entry.code.length : 0 }
}
