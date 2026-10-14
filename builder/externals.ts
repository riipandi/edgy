import { builtinModules } from 'node:module'
import path from 'node:path'
import { isNativePackage } from './native.ts'
import { resolvePackageDir } from './resolve.ts'

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

/**
 * Matches bare package specifiers (skips relative, absolute and `node:` ids).
 * The lookahead is fine here because this regexp runs in JS, not in a bundler's
 * native regexp engine.
 */
const BARE_SPECIFIER = /^(?!\.{1,2}(?:[/\\]|$))(@[^/\\]+[/\\][^/\\]+|[^@/\\][^/\\]*)(?:[/\\]|$)/

/** Returns the package name of a bare specifier, or `undefined`. */
export const packageNameOf = (id: string): string | undefined => {
  const match = BARE_SPECIFIER.exec(id)
  return match ? match[1] : undefined
}

/**
 * Matches the package segment that follows a `node_modules` directory.
 *
 * Applied with {@link packageFromPath} it takes the **last** match, so pnpm's
 * nested store layout
 * (`…/node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`) resolves to the real
 * package instead of the `.pnpm` folder.
 */
const PACKAGE_IN_PATH = /[\\/]node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/g

/**
 * Returns the package that owns an absolute module path, or `undefined`.
 *
 * Used by per-package code splitting: a module id like
 * `/proj/node_modules/h3/dist/index.mjs` yields `h3`.
 */
export const packageFromPath = (id: string): string | undefined => {
  let name: string | undefined
  for (const match of id.matchAll(PACKAGE_IN_PATH)) name = match[1]
  return name
}

/** Does the id refer to a Node.js built-in module? */
export const isBuiltin = (id: string): boolean => NODE_BUILTINS.has(id)

/** True for relative (`./x`), absolute (`/x`) and builtin specifiers. */
export const isBareSpecifier = (id: string): boolean =>
  !id.startsWith('.') && !path.isAbsolute(id) && !isBuiltin(id) && packageNameOf(id) !== undefined

/**
 * Decides whether a bare import must stay external, and records it for tracing.
 *
 * Shared by both bundler backends so resolution semantics never drift:
 *
 * 1. Builtins are always external and untouched.
 * 2. Packages matched by the `external` config list are external.
 * 3. Packages that ship a native addon are external (auto-detected).
 * 4. Everything else is bundled.
 */
export const classifyExternal = (options: {
  readonly id: string
  readonly importer: string | undefined
  readonly rootDir: string
  readonly conditions: readonly string[]
  readonly external: readonly (string | RegExp)[]
  readonly externals: Map<string, ExternalPackage>
}): ExternalPackage | undefined => {
  const { id, importer, rootDir, conditions, external, externals } = options
  if (isBuiltin(id)) return undefined

  const name = packageNameOf(id)
  if (!name) return undefined

  const cached = externals.get(name)
  if (cached) return cached

  // `importer` is a file path; resolution must start from its directory.
  const fromDir = importer ? path.dirname(importer) : rootDir
  const dir = resolvePackageDir(name, fromDir, conditions)
  if (!dir) return undefined

  const configured = matches(external, name)
  const native = !configured && isNativePackage(dir)
  if (!configured && !native) return undefined

  const pkg: ExternalPackage = { name, dir, reason: configured ? 'config' : 'native' }
  externals.set(name, pkg)
  return pkg
}

const matches = (patterns: readonly (string | RegExp)[], name: string): boolean =>
  patterns.some((pattern) => (pattern instanceof RegExp ? pattern.test(name) : pattern === name))
