import { AsyncLocalStorage } from 'node:async_hooks'

export interface PageMeta {
  cache?: string
}

// The server-function handler and the request middleware live in different
// async scopes of one render; the shared symbol keeps them on a single
// per-request store even though both bundles inline this module.
const pageMetaKey = Symbol.for('edgy.page-meta')
const pageMeta =
  (Reflect.get(globalThis, pageMetaKey) as AsyncLocalStorage<PageMeta> | undefined) ??
  new AsyncLocalStorage<PageMeta>()
Reflect.set(globalThis, pageMetaKey, pageMeta)

export const getPageMeta = (): PageMeta | undefined => pageMeta.getStore()

export const runWithPageMeta = <A>(state: PageMeta, run: () => A | Promise<A>): Promise<A> | A =>
  pageMeta.run(state, run)
