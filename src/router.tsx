import { createRouter } from '@tanstack/react-router'
import { cspNonce } from '#/kernel/csp_nonce.ts'
import { routeTree } from './routeTree.gen.ts'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // Preload route loaders when a link gains pointer or keyboard intent;
    // staleTime 0 keeps the navigation itself revalidating.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ssr: { nonce: cspNonce }
  })
}
