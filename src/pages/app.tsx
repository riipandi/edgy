import { AppShell } from './app-shell.tsx'
import { routesReady, Router } from './router.ts'

/**
 * The whole browser application: the document shell wrapping the file-based router. The server
 * renders this — the router locates the request through the URL prop `htmlResponse` passes (the
 * fallback when no request scope exists); the browser hydrates it (`entry.tsx`) and the router
 * takes over navigation.
 */
export interface AppProps {
  readonly title: string
  /** The request URL, so the server render matches the route the browser hydrates. */
  readonly url?: string | undefined
  readonly scripts?: readonly string[] | undefined
}

export const App = (props: AppProps) => (
  <AppShell title={props.title} scripts={props.scripts === undefined ? [] : props.scripts}>
    {props.url === undefined ? <Router /> : <Router url={props.url} />}
  </AppShell>
)

// The server render awaits this (through `definePageHandler`) so the route tree exists before
// the first render — see router.ts for why the manifest import cannot be top-level.
export { routesReady }

export default App
