import { createRouter } from '@solidjs/router'
import { fileRoutes } from '@solidjs/router/fs'
import type { FileRouteEntry } from '@solidjs/router/fs'

// The manifest import is deferred into `loadRoutes`: a top-level await here would make the
// router chunk depend on the manifest chunk, which imports the router — a circular top-level
// await that deadlocks the built server bundle. `createRouter` reads `config.routes` once at
// creation (it copies the routes onto the instance), so the getter answers with an empty tree
// until `loadRoutes` lands; every render path awaits `routesReady` first, and `Router.match`
// recompiles the branches on the next read after the assignment.
let routes: readonly FileRouteEntry[] | undefined

export const Router = createRouter({
  get routes() {
    return routes ?? []
  }
})

export const loadRoutes = async (): Promise<void> => {
  routes = fileRoutes((await import('virtual:file-routes')).pageRoutes)
}

/** The sync point the server render awaits before its first router render (see `loadRoutes`). */
export const routesReady = loadRoutes
