/**
 * What one built browser entry exposes to the pages that link it: the hashed script and every
 * stylesheet it pulled in, both under `/assets/`. Written by the browser build
 * (`builder/edgy.ts`, `clientManifest`).
 */
export interface ClientEntry {
  readonly script: string
  readonly styles: readonly string[]
}

export type ClientManifest = Record<string, ClientEntry>

/**
 * The build's manifest, filled by the server build (`builder/node.ts`, `worker.ts`) from the
 * file the browser build emitted. The build replaces the bare identifier through Vite's `define`
 * (the key is `__EDGY_CLIENT_MANIFEST__`); in development nothing replaces it and the empty
 * fallback answers, because the dev server injects its own scripts. The global declaration only
 * carries the type: the identifier is read guarded, so an unreplaced name never throws.
 */
declare global {
  // eslint-disable-next-line -- the build injects the constant through Vite's `define`
  var __EDGY_CLIENT_MANIFEST__: ClientManifest | undefined
}

export const clientManifest: ClientManifest =
  typeof __EDGY_CLIENT_MANIFEST__ === 'undefined' ? {} : __EDGY_CLIENT_MANIFEST__
