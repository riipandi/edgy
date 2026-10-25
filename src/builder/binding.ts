import { cpSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// The Turso engine's JavaScript inlines like any dependency, but the compiled
// addon is `require`d at runtime and no bundler can carry it. The package name
// is platform-specific; a platform with no binding here cannot run the bundle.
const NATIVE_BINDINGS: Record<string, string> = {
  'darwin-arm64': '@tursodatabase/database-darwin-arm64',
  'linux-arm64': '@tursodatabase/database-linux-arm64-gnu',
  'linux-x64': '@tursodatabase/database-linux-x64-gnu',
  'win32-x64': '@tursodatabase/database-win32-x64-msvc'
}

// Resolved beside the engine package, which is where pnpm links an optional
// dependency; a hoisting layout puts it in the parent node_modules instead.
const nativeBinding = (): { readonly name: string; readonly dir: string } => {
  const name = NATIVE_BINDINGS[`${process.platform}-${process.arch}`]
  if (name === undefined)
    throw new Error(
      `standalone build: the turso engine has no native binding for ${process.platform}-${process.arch}`
    )
  const engineDir = path.dirname(
    path.dirname(createRequire(import.meta.url).resolve('@tursodatabase/database'))
  )
  const beside = path.join(path.dirname(engineDir), name.slice(name.indexOf('/') + 1))
  if (existsSync(beside)) return { name, dir: beside }
  return {
    name,
    dir: path.dirname(
      path.dirname(createRequire(path.join(engineDir, 'package.json')).resolve(name))
    )
  }
}

// `dist/` has to run on its own: `vpr start` and a copied `dist/` would both
// fail with "Cannot find native binding" without this.
export const copyNativeBinding = (distDir: string): void => {
  const binding = nativeBinding()
  // Dereference: pnpm links the package out of its store, and a copied `dist/`
  // must not depend on that store staying in place.
  cpSync(binding.dir, path.join(distDir, 'node_modules', ...binding.name.split('/')), {
    recursive: true,
    dereference: true
  })
}
