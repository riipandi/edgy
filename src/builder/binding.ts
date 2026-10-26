import { cpSync } from 'node:fs'
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

// Resolved through the engine's own require scope, since the platform
// package is always one of its optionalDependencies. The package root is the
// directory holding ITS package.json, not a fixed number of `dirname()`
// calls up from its main file.
const nativeBinding = (): { readonly name: string; readonly dir: string } => {
  const name = NATIVE_BINDINGS[`${process.platform}-${process.arch}`]
  if (name === undefined)
    throw new Error(
      `standalone build: the turso engine has no native binding for ${process.platform}-${process.arch}`
    )
  const require = createRequire(createRequire(import.meta.url).resolve('@tursodatabase/database'))
  return { name, dir: path.dirname(require.resolve(`${name}/package.json`)) }
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
