// Client-safe read side of the CSP nonce: the storage itself lives in
// csp_nonce.server.ts (node:async_hooks must not reach the browser
// bundle), shared through this global so both server bundles and this
// module land on one storage.
const nonceStorageKey = Symbol.for('edgy.csp-nonce-storage')

export const getCspNonce = (): string | undefined =>
  (
    Reflect.get(globalThis, nonceStorageKey) as { getStore(): string | undefined } | undefined
  )?.getStore()
