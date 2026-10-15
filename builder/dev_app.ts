#!/usr/bin/env node
import { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { createServer } from 'vite'
import { installDevServer } from '../src/kernel/http/dev_server.ts'

/**
 * The server of `pnpm dev`: the Node server with the Vite dev server in front of it, on one port.
 *
 * Vite runs in middleware mode (`appType: 'custom'`: it serves modules, styles and the hot-reload
 * channel, and never answers a page or a 404 itself) and the application is loaded through Vite's
 * module runner, which is what lets it import `.marko` templates and `.css.ts` styles. The
 * application then mounts `vite.middlewares` in front of its routes (`middleware/dev_assets.ts`),
 * handed over through `installDevServer`.
 *
 * Editing a page or a style is a hot update. Editing server code restarts this process, which is
 * the job of `dev.ts` (it starts this file and watches `src/`; Node's own `--watch` is not used,
 * see there). Run this file directly to start the server once, without watching.
 *
 * The command line is the application's own: `pnpm dev` ends in `serve`, and so can anything else
 * the CLI accepts (`node builder/dev_app.ts serve --help`).
 */
const root = path.resolve(import.meta.dirname, '..')

/**
 * Whether this run is a server that stays up. Anything else (`config:generate`, a migration,
 * `--help`) is a command that finishes, and must be able to: Vite's file watcher and hot-reload
 * socket keep a process alive for as long as they exist, so a one-shot command that left them
 * running would never return.
 */
const args = process.argv.slice(2)
const staysUp =
  args[0] === 'serve' && !args.some((arg) => ['--help', '-h', '--version', '-v'].includes(arg))

const vite = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  appType: 'custom',
  // The default loader bundles the configuration into `node_modules/.vite-temp` and imports it,
  // which is a file written on every start. The runner loads it in place, with nothing written.
  configLoader: 'runner',
  server: {
    middlewareMode: true,
    // Hot reload gets its own socket; left to default it would listen on every interface.
    hmr: staysUp ? { host: '127.0.0.1' } : false,
    ...(staysUp ? {} : { ws: false as const }),
    watch: staysUp ? {} : null
  }
})

// h3 hands over HTTP/1 or HTTP/2 objects; Connect (Vite) speaks HTTP/1 only, and `pnpm dev` is
// plain HTTP/1, so anything else simply falls through to the application's routes.
installDevServer({
  middleware: (req, res, next) =>
    req instanceof IncomingMessage && res instanceof ServerResponse
      ? vite.middlewares(req, res, next)
      : next(),
  close: () => vite.close()
})

// Vite answers SIGTERM by closing itself and exiting at once, which would cut the application's
// graceful shutdown (draining requests, closing the database, flushing logs) short. The
// application handles the signal itself, and stops Vite when it is done (`src/main.ts`).
process.removeAllListeners('SIGTERM')

await vite.ssrLoadModule('/src/main.ts')
