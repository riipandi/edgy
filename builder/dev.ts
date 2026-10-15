#!/usr/bin/env node
import { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { createServer } from 'vite'
import { installDevServer } from '../src/kernel/http/dev_server.ts'

/**
 * `pnpm dev`: the Node server with the Vite dev server in front of it, on one port.
 *
 * Vite runs in middleware mode (`appType: 'custom'`: it serves modules, styles and the hot-reload
 * channel, and never answers a page or a 404 itself) and the application is loaded through Vite's
 * module runner, which is what lets it import `.marko` templates and `.css.ts` styles. The
 * application then mounts `vite.middlewares` in front of its routes (`middleware/dev_assets.ts`),
 * handed over through `installDevServer`.
 *
 * Editing a page or a style is a hot update. Editing server code restarts this process
 * (`node --watch-path=src`, see `watch:node`), the same as before Vite was involved.
 *
 * The command line is the application's own: `pnpm dev` ends in `serve`, and so can anything else
 * the CLI accepts (`node builder/dev.ts serve --help`).
 */
const root = path.resolve(import.meta.dirname, '..')

const vite = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  appType: 'custom',
  // Hot reload gets its own socket; left to default it would listen on every interface.
  server: { middlewareMode: true, hmr: { host: '127.0.0.1' } }
})

// h3 hands over HTTP/1 or HTTP/2 objects; Connect (Vite) speaks HTTP/1 only, and `pnpm dev` is
// plain HTTP/1, so anything else simply falls through to the application's routes.
installDevServer({
  middleware: (req, res, next) =>
    req instanceof IncomingMessage && res instanceof ServerResponse
      ? vite.middlewares(req, res, next)
      : next()
})

// The application owns the process from here: `NodeRuntime.runMain` handles the signals and exits.
process.once('exit', () => void vite.close())
await vite.ssrLoadModule('/src/main.ts')
