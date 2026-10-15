import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { getAssetKeys, getRawAsset, isSea } from 'node:sea'
import type { AssetSource } from './assets.ts'

/** Ids start with `/`; anything that is not a plain name, or that starts a segment with `.`, is refused. */
const SAFE_NAME = /^\/(?!\.)[\w@.+~%-]+(?:\/(?!\.)[\w@.+~%-]+)*$/

/** Assets read from a directory. Reads are confined to `root`, symbolic links included. */
export const directoryAssets = (root: string): AssetSource => {
  const base = path.resolve(root)
  const realBase = realpath(base).catch(() => base)
  const resolve = async (id: string): Promise<string | undefined> => {
    if (!SAFE_NAME.test(id) || id.includes('..')) return undefined
    const file = path.join(base, id)
    if (!file.startsWith(base + path.sep)) return undefined
    // A link inside `root` may point out of it; the lexical check above cannot see that.
    const real = await realpath(file).catch(() => undefined)
    return real?.startsWith((await realBase) + path.sep) ? real : undefined
  }
  return {
    meta: async (id) => {
      const file = await resolve(id)
      if (file === undefined) return undefined
      const info = await stat(file).catch(() => undefined)
      return info?.isFile() ? { size: info.size, mtime: info.mtimeMs } : undefined
    },
    contents: async (id) => {
      const file = await resolve(id)
      return file === undefined ? undefined : new Uint8Array(await readFile(file))
    }
  }
}

/** Assets embedded in a single-executable app, keyed `public/<path>`. `undefined` outside one. */
export const embeddedAssets = (): AssetSource | undefined => {
  if (!isSea()) return undefined
  const keys = new Set(getAssetKeys())
  const key = (id: string) => `public${id}`
  return {
    meta: (id) => (keys.has(key(id)) ? { size: getRawAsset(key(id)).byteLength } : undefined),
    contents: (id) => (keys.has(key(id)) ? new Uint8Array(getRawAsset(key(id))) : undefined)
  }
}
