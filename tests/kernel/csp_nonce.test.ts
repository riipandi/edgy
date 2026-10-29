import { describe, expect, it } from 'vite-plus/test'
import { withCspNonce } from '#/kernel/csp_nonce.server.ts'
import { getCspNonce } from '#/kernel/csp_nonce.ts'

describe('the csp nonce storage', () => {
  it('mints a distinct nonce per request', async () => {
    const nonces = await Promise.all([
      withCspNonce(async (nonce) => nonce),
      withCspNonce(async (nonce) => nonce)
    ])
    expect(nonces[0]).not.toBe(nonces[1])
    expect(nonces[0]).toMatch(/^nonce_/)
  })

  it('exposes the minted nonce to code inside the request scope', async () => {
    await withCspNonce(async (nonce) => {
      expect(getCspNonce()).toBe(nonce)
    })
  })

  it('reads no nonce outside a request scope', () => {
    expect(getCspNonce()).toBeUndefined()
  })

  it('restores the outer nonce after a nested scope', async () => {
    await withCspNonce(async (outer) => {
      const inner = await withCspNonce(async (nonce) => {
        expect(getCspNonce()).toBe(nonce)
        return nonce
      })
      expect(inner).not.toBe(outer)
      expect(getCspNonce()).toBe(outer)
    })
  })
})
