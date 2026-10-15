import { definePlugin, fromNodeHandler } from 'h3'
import type { DevServer } from '../kernel/http/dev_server.ts'

/**
 * Mounts the Vite dev server in front of the application: module requests, `/@vite/client` and the
 * styles it compiles on demand are answered by Vite, and everything else (`/api`, pages) falls
 * through to the routes. Registered first, so Vite's own traffic is neither counted in flight
 * nor written to the request log.
 */
export const devAssets = definePlugin<DevServer>((app, dev) => {
  app.use(fromNodeHandler(dev.middleware))
})
