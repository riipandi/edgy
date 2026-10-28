import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { cspNonce } from '#/kernel/csp_nonce.ts'
import { getContext, RootProvider } from './provider.tsx'
import { routeTree } from './routes.gen.ts'

export function getRouter() {
  const { queryClient } = getContext()
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ssr: { nonce: cspNonce },
    context: { queryClient },
    Wrap: ({ children }) => <RootProvider queryClient={queryClient}>{children}</RootProvider>
  })
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
