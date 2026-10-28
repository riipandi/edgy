import { AsyncLocalStorage } from 'node:async_hooks'
import { typeid } from 'typeid-js'

// One nonce per request: the renderer mints it, writes it into the CSP
// header, and the Start router reads it from the request context to stamp
// its streamed scripts. The entry bundle and the page bundle each inline
// this module, so the shared global keeps them on one storage.
const nonceStorageKey = Symbol.for('edgy.csp-nonce-storage')
const nonceStorage =
  (Reflect.get(globalThis, nonceStorageKey) as AsyncLocalStorage<string> | undefined) ??
  new AsyncLocalStorage<string>()
Reflect.set(globalThis, nonceStorageKey, nonceStorage)

export const withCspNonce = <A>(run: (nonce: string) => Promise<A>): Promise<A> => {
  const nonce = typeid('nonce').toString()
  return nonceStorage.run(nonce, () => run(nonce))
}

export const getCspNonce = (): string | undefined => nonceStorage.getStore()
