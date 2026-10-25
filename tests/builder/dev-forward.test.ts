import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite-plus'
import { afterAll, expect, it } from 'vite-plus/test'
import { effectVite } from '../../src/builder/vite-plugin.ts'
import { quietConsole } from '../fixtures/console.ts'

// The dev plugin's forwarding runs the real composition root, so the suite
// needs a reachable database; each run gets its own file. The composition's
// request fibers log through the console, so the app records are filtered.
const directory = mkdtempSync(path.join(tmpdir(), 'edgy-dev-plugin-'))
process.env['DATABASE_URL'] ??= `file:${path.join(directory, 'dev.db')}`

afterAll(quietConsole())

type Middleware = (
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  next: () => void
) => void

const installPlugin = (
  plugin: Plugin
): { middleware: Middleware; teardown: () => Promise<void> } => {
  let middleware: Middleware = (_req, res) => {
    res.statusCode = 500
    res.end('middleware not installed')
  }
  const fakeServer = {
    config: { mode: 'test' },
    middlewares: { use: (fn: Middleware) => (middleware = fn) }
  } as unknown as ViteDevServer
  const teardown = (
    plugin.configureServer as (server: ViteDevServer) => (() => Promise<void>) | undefined
  )(fakeServer)
  return { middleware, teardown: teardown ?? (async () => undefined) }
}

let listener: Server | undefined
afterAll(async () => {
  listener?.close()
  rmSync(directory, { recursive: true, force: true })
})

it('forwards /api requests to the composition root and skips page paths', async () => {
  const plugin = effectVite({ enabled: true })
  const { middleware, teardown } = installPlugin(plugin)

  listener = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404
      res.end('fell through')
    })
  ).listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => listener!.once('listening', resolve))
  const port = (listener!.address() as { port: number }).port

  // A page path is not the dev middleware's business.
  const page = await fetch(`http://127.0.0.1:${port}/some/page`)
  expect(await page.text()).toBe('fell through')

  // An API path is answered by the real composition root.
  const health = await fetch(`http://127.0.0.1:${port}/api/health`)
  expect(health.status).toBe(200)
  expect((await health.json()).status).toBe('ok')

  await teardown()
})
