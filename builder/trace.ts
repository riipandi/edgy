import { existsSync } from 'node:fs'
import path from 'node:path'
import { copyPath, writeText } from './copy.ts'
import type { ExternalPackage } from './externals.ts'
import { readDependencies, resolvePackageDir } from './resolve.ts'

/** Summary of a trace run, for build logging. */
export interface TraceResult {
  readonly packages: readonly string[]
  readonly files: number
}

/**
 * Copies external packages into `<serverDir>/node_modules`.
 *
 * This is the lean equivalent of Nitro's `nf3` (node-file-trace) step. We do a
 * *whole-package* copy rather than a per-file trace:
 *
 * - Native addons load `.node` binaries through `require`/`bindings`, which
 *   static analysis cannot follow reliably — Nitro's own log even warns that
 *   the deploy target must match the builder platform.
 * - Whole-package copies are predictable and easy to reason about; the packages
 *   in question are small.
 *
 * Transitive dependencies are followed too, so a native package that depends on
 * another package still resolves at runtime.
 */
export const traceExternals = (options: {
  readonly externals: Map<string, ExternalPackage>
  readonly serverDir: string
  readonly conditions: readonly string[]
}): TraceResult => {
  const nodeModules = path.join(options.serverDir, 'node_modules')
  const packages: string[] = []
  const seen = new Set<string>()

  const tracePackage = (pkg: ExternalPackage): void => {
    if (seen.has(pkg.name)) return
    seen.add(pkg.name)

    copyPath(pkg.dir, path.join(nodeModules, pkg.name))
    packages.push(pkg.name)

    const dependencies = readDependencies(path.join(pkg.dir, 'package.json'))
    for (const dependency of Object.keys(dependencies)) {
      const dir = resolveDependencyDir(dependency, pkg.dir, options.conditions)
      if (dir) tracePackage({ name: dependency, dir, reason: pkg.reason })
    }
  }

  for (const pkg of options.externals.values()) tracePackage(pkg)

  writeText(
    path.join(nodeModules, '.package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages: {} }, null, 2)}\n`
  )

  return { packages, files: packages.length }
}

/** Locates a dependency's package directory starting from the dependent. */
const resolveDependencyDir = (
  name: string,
  fromDir: string,
  conditions: readonly string[]
): string | undefined => {
  // Walk up the directory tree looking for a hoisted install first.
  let current = fromDir
  for (;;) {
    const candidate = path.join(current, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  // Fall back to the resolver for pnpm's nested layout.
  return resolvePackageDir(name, fromDir, conditions)
}
