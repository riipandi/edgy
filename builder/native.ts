import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readJson } from './resolve.ts'

const NATIVE_EXTENSION = '.node'

/**
 * Heuristic: does this package ship a native addon?
 *
 * Covers the three common shapes: a `binding.gyp` build (node-gyp), a
 * prebuilt addon in `prebuilds/`, or a loose `.node` binary anywhere shallow in
 * the package. Deep recursion is avoided on purpose — addons live at the root
 * or one level down (`build/Release`, `prebuilds/<platform>`).
 */
export const isNativePackage = (pkgDir: string): boolean => {
  if (existsSync(path.join(pkgDir, 'binding.gyp'))) return true
  if (existsSync(path.join(pkgDir, 'prebuilds'))) return true
  if (readJson(path.join(pkgDir, 'package.json'))?.['gypfile'] === true) return true
  return containsNativeBinary(pkgDir, 2)
}

/** Walks `dir` up to `depth` levels looking for a `.node` binary. */
const containsNativeBinary = (dir: string, depth: number): boolean => {
  if (depth < 0) return false

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return false
  }

  for (const entry of entries) {
    if (entry === 'node_modules') continue

    const full = path.join(dir, entry)
    if (entry.endsWith(NATIVE_EXTENSION)) return true

    try {
      if (statSync(full).isDirectory() && containsNativeBinary(full, depth - 1)) return true
    } catch {
      // Unreadable entry (symlink loop, permissions) — ignore and continue.
    }
  }

  return false
}
