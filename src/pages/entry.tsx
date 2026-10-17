// The browser entry: it hydrates the application the server rendered — the document shell
// wrapping the file-based router, which then owns navigation.
import { hydrate } from '@solidjs/web'
import { createComponent } from 'solid-js'
import { App } from './app.tsx'
import { routesReady } from './router.ts'

const root = document.getElementById('app-root')
if (root === null) throw new Error('the page is missing its hydration root')

// Client-side the router owns the URL, so only the title travels in. Routes load before the
// first render so the server markup and the client match from the start.
await routesReady()
hydrate(
  () => createComponent(App, { title: document.title, url: window.location.href, scripts: [] }),
  root
)
