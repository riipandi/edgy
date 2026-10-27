import { typeid } from 'typeid-js'

// One nonce per process: the Effect renderer writes it into the CSP header
// and the Start router stamps it onto its streamed scripts. The entry bundle
// and the page bundle each inline this module, so they resolve the shared
// global to agree on the value.
const nonceKey = Symbol.for('edgy.csp-nonce')
const existing = Reflect.get(globalThis, nonceKey) as string | undefined
const nonce = existing ?? typeid('nonce').toString()
if (existing === undefined) Reflect.set(globalThis, nonceKey, nonce)

export const cspNonce = nonce
