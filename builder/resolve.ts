import { resolveModulePath } from 'exsolve'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Resolves the on-disk directory of a bare package specifier.
 *
 * `exsolve` implements Node's full resolution algorithm (export maps, import
 * maps, CJS/ESM, custom conditions) and is what Nitro itself uses to locate
 * externals before tracing them.
 *
 * Two strategies, because many packages do not expose `./package.json` in their
 * `exports` map:
 *
 * 1. Resolve `<name>/package.json` directly — fastest, exact.
 * 2. Resolve the package entry and walk up until the directory whose
 *    `package.json` declares `name`.
 */
export const resolvePackageDir = (
  name: string,
  from: string,
  conditions: readonly string[]
): string | undefined => {
  const fromDir = ensureTrailingSlash(from)

  const manifest = resolveModulePath(`${name}/package.json`, {
    from: fromDir,
    conditions: [...conditions],
    try: true
  })
  if (manifest) return path.dirname(manifest)

  const entry = resolveModulePath(name, {
    from: fromDir,
    conditions: [...conditions],
    extensions: ['.mjs', '.cjs', '.js', '.mts', '.cts', '.ts', '.json'],
    try: true
  })
  return entry ? walkUpToPackage(entry, name) : undefined
}

/** Walks up from a resolved entry until a `package.json` with a matching name. */
const walkUpToPackage = (entry: string, name: string): string | undefined => {
  let current = path.dirname(entry)
  for (;;) {
    const manifest = path.join(current, 'package.json')
    if (existsSync(manifest) && readPackageName(manifest) === name) return current
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** `exsolve` skips a filesystem stat when `from` ends with a separator. */
const ensureTrailingSlash = (dir: string): string =>
  dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`

/**
 * Reads and parses a JSON object file, returning `undefined` on any failure
 * (missing file, invalid JSON, or a non-object top level).
 */
export const readJson = (file: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return isObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Runtime guard: a non-null, non-array object. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the `dependencies` map of a package manifest as a string record. */
export const readDependencies = (file: string): Record<string, string> => {
  const deps = readJson(file)?.['dependencies']
  if (!isObject(deps)) return {}
  return Object.fromEntries(
    Object.entries(deps).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

/** Reads the `name` field of a package manifest. */
export const readPackageName = (file: string): string | undefined => {
  const name = readJson(file)?.['name']
  return typeof name === 'string' ? name : undefined
}
