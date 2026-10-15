import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { getAssetKeys, getRawAsset, isSea } from 'node:sea'
import type { AssetSource } from './assets.ts'

/** Opaque ids from h3 start with `/`; anything that is not a plain relative name is refused. */
const SAFE_NAME = /^\/[\w@.+~%-]+(?:\/[\w@.+~%-]+)*$/

/** Assets read from a directory on disk (`dist/server/public`). Reads are confined to `root`. */
export const directoryAssets = (root: string): AssetSource => {
  const base = path.resolve(root)
  const resolve = (id: string): string | undefined => {
    if (!SAFE_NAME.test(id) || id.includes('..')) return undefined
    const file = path.join(base, id)
    return file.startsWith(base + path.sep) ? file : undefined
  }
  return {
    meta: async (id) => {
      const file = resolve(id)
      if (file === undefined) return undefined
      const info = await stat(file).catch(() => undefined)
      return info?.isFile() ? { size: info.size, mtime: info.mtimeMs } : undefined
    },
    contents: async (id) => {
      const file = resolve(id)
      return file === undefined ? undefined : new Uint8Array(await readFile(file))
    }
  }
}

/**
 * Assets embedded in a single-executable application (`seaConfig.assets`, keyed
 * `public/<path>`). `undefined` when the process is not one.
 */
export const embeddedAssets = (): AssetSource | undefined => {
  if (!isSea()) return undefined
  const keys = new Set(getAssetKeys())
  const key = (id: string) => `public${id}`
  return {
    meta: (id) => (keys.has(key(id)) ? { size: getRawAsset(key(id)).byteLength } : undefined),
    contents: (id) => (keys.has(key(id)) ? new Uint8Array(getRawAsset(key(id))) : undefined)
  }
}
