import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

interface Manifest {
  readonly dependencies: readonly string[]
  readonly gypfile: boolean
}

const readManifest = (dir: string): Manifest | undefined => {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (typeof raw !== 'object' || raw === null) return undefined
    const dependencies: unknown = Reflect.get(raw, 'dependencies')
    return {
      gypfile: Reflect.get(raw, 'gypfile') === true,
      dependencies:
        typeof dependencies === 'object' && dependencies !== null ? Object.keys(dependencies) : []
    }
  } catch {
    return undefined
  }
}

/** The directory `name` resolves to from `from`, looking up through `node_modules` as Node does. */
const locate = (name: string, from: string): string | undefined => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate)
    if (path.dirname(dir) === dir) return undefined
  }
}

const hasBinary = (dir: string, depth = 4): boolean => {
  if (depth < 0) return false
  return readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? entry.name !== 'node_modules' && hasBinary(path.join(dir, entry.name), depth - 1)
      : entry.name.endsWith('.node')
  )
}

const isNative = (dir: string, manifest: Manifest): boolean =>
  manifest.gypfile || existsSync(path.join(dir, 'binding.gyp')) || hasBinary(dir)

/**
 * Packages the application depends on at run time (`dependencies`, transitively) that ship a
 * native addon: a `binding.gyp`, `"gypfile": true`, or a `.node` file. The server build inlines
 * every dependency, which cannot work for these.
 */
export const findNativeAddons = (root: string): string[] => {
  const seen = new Set<string>()
  const found: string[] = []
  const visit = (name: string, from: string): void => {
    const dir = locate(name, from)
    if (dir === undefined || seen.has(dir)) return
    seen.add(dir)
    const manifest = readManifest(dir)
    if (manifest === undefined) return
    if (isNative(dir, manifest)) found.push(name)
    for (const child of manifest.dependencies) visit(child, dir)
  }
  for (const name of readManifest(root)?.dependencies ?? []) visit(name, root)
  return found.sort()
}

export const nativeAddonMessage = (names: readonly string[]): string =>
  `The server build inlines every dependency, which cannot load a native addon. ` +
  `Packages with one: ${names.join(', ')}. Mark them \`ssr.external\` and copy them (with their ` +
  `own dependencies) into dist/server/node_modules, or choose a pure-JavaScript package. ` +
  `The single executable cannot carry an addon either.`
