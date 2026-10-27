import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

export interface GlobalContext {
  queryClient: QueryClient
}

export function getContext(): GlobalContext {
  return { queryClient: new QueryClient() }
}

export function RootProvider({
  children,
  queryClient
}: PropsWithChildren<{ queryClient: QueryClient }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
