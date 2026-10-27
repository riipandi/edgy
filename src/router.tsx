import { createRouter } from '@tanstack/react-router'
import { cspNonce } from '#/kernel/csp_nonce.ts'
import { routeTree } from './routeTree.gen.ts'

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, ssr: { nonce: cspNonce } })
}
