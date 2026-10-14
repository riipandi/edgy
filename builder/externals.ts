import type { Plugin } from 'esbuild'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { isNativePackage } from './native.ts'
import { readDependencies, resolveModule, resolvePackageDir } from './resolve.ts'

/** A package that must live in `node_modules/` at runtime instead of the bundle. */
export interface ExternalPackage {
  /** Bare package name, e.g. `better-sqlite3`. */
  readonly name: string
  /** Absolute path to the package root on the build machine. */
  readonly dir: string
  /** Why the package was kept external (for build logging). */
  readonly reason: 'native' | 'config'
}

const NODE_BUILTINS = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((id) => `node:${id}`)
])

/** Matches bare package specifiers (skips relative, absolute and `node:` ids). */
const BARE_SPECIFIER = /^(?!\.{1,2}(?:[/\\]|$))(@[^/\\]+[/\\][^/\\]+|[^@/\\][^/\\]*)(?:[/\\]|$)/

/**
 * esbuild's `onResolve` filter is compiled to a Go regexp, which has no
 * lookahead. The filter stays intentionally broad; {@link packageNameOf} does
 * the real (lookahead-based) check inside the callback.
 */
const RESOLVE_FILTER = /^[^./\\]/

/** Returns the package name of a bare specifier, or `undefined`. */
export const packageNameOf = (id: string): string | undefined => {
  const match = BARE_SPECIFIER.exec(id)
  return match ? match[1] : undefined
}

/** Does the id refer to a Node.js built-in module? */
export const isBuiltin = (id: string): boolean => NODE_BUILTINS.has(id)

const matches = (patterns: readonly (string | RegExp)[], name: string): boolean =>
  patterns.some((pattern) => (pattern instanceof RegExp ? pattern.test(name) : pattern === name))

/**
 * esbuild plugin that mirrors Nitro's `externals` plugin.
 *
 * Resolution order:
 * 1. `node:*` / builtin ids are always external and untouched.
 * 2. Packages matched by `external` (config list + auto-detected natives) are
 *    marked external and recorded in `externals` for the tracer.
 * 3. Everything else is handed back to esbuild and bundled.
 *
 * Returning `{ external: true }` keeps the bare specifier in the output, which
 * is exactly what the tracer needs to relocate into `node_modules/`.
 */
export const externalsPlugin = (options: {
  readonly rootDir: string
  readonly conditions: readonly string[]
  readonly external: readonly (string | RegExp)[]
  readonly externals: Map<string, ExternalPackage>
}): Plugin => ({
  name: 'builder:externals',
  setup(build) {
    build.onResolve({ filter: RESOLVE_FILTER }, (args) => {
      if (isBuiltin(args.path)) return { path: args.path, external: true }

      const name = packageNameOf(args.path)
      if (!name) return null

      // `args.importer` is a file path; resolution must start from its directory.
      const fromDir = args.importer ? path.dirname(args.importer) : options.rootDir
      const dir = resolvePackageDir(name, fromDir, options.conditions)
      if (!dir) return null

      const configured = matches(options.external, name)
      const native = !configured && isNativePackage(dir)
      if (!configured && !native) return null

      options.externals.set(name, { name, dir, reason: configured ? 'config' : 'native' })

      return { path: args.path, external: true }
    })
  }
})

/** Reads the resolved entry's package.json to discover its own dependencies. */
export const readDeclaredDependencies = (rootDir: string): Record<string, string> =>
  readDependencies(path.join(rootDir, 'package.json'))

/** Re-exported so callers can resolve a package without re-implementing it. */
export { resolveModule }
