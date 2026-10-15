import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { Plugin } from 'vite'
import { OUT_DIR } from './platform.ts'

/** A port nothing is listening on, asked of the operating system. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0))
    })
  })

/** Resolves once something accepts connections on `port`; rejects if the process has exited or it takes too long. */
const accepting = (
  port: number,
  exited: Promise<number | null>,
  timeoutMs = 20_000
): Promise<void> =>
  new Promise((resolve, reject) => {
    let over = false
    void exited.then((code) => {
      over = true
      reject(new Error(`the server exited with ${code} before it was ready`))
    })
    const deadline = Date.now() + timeoutMs
    const attempt = () => {
      if (over) return
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline)
          reject(new Error(`the server did not start within ${timeoutMs} ms`))
        else setTimeout(attempt, 100)
      })
    }
    attempt()
  })

/** Passes a request to the built server and its answer back. */
const forward = (port: number, req: http.IncomingMessage, res: http.ServerResponse): void => {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '' }
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    }
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('Bad gateway')
  })
  req.pipe(upstream)
}

/**
 * `vite preview` for the Node server: runs the build in `dist/server` (the real server, started
 * exactly as `pnpm start` does, with `.env.local`) on a port of its own, and puts the preview
 * server's address in front of it. Vite's preview only knows how to serve static files, and this
 * application is a server; the proxy is what makes the one address, and `Ctrl+C`, work the same as
 * for `vite`.
 *
 * Registered directly (not as a returned hook), so it comes before Vite's own static handler: the
 * build output is never served as files. It does not build: `vite preview` serves what exists, and
 * says so when nothing does.
 */
export const nodePreview = (): Plugin => ({
  name: 'edgy:node-preview',
  apply: (_config, env) => env.isPreview === true,
  async configurePreviewServer(server) {
    const root = server.config.root
    const entry = path.resolve(root, OUT_DIR.node, 'index.mjs')
    if (!existsSync(entry)) {
      throw new Error(
        `Nothing to preview: ${path.relative(root, entry)} is missing. Run \`pnpm build\` first.`
      )
    }

    const port = await freePort()
    const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', entry, 'serve'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }
    })
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))
    const ready = accepting(port, exited)
    ready.catch((error: unknown) => server.config.logger.error(String(error)))

    const stop = () => child.kill('SIGTERM')
    process.once('exit', stop)
    server.httpServer.once('close', stop)

    server.middlewares.use((req, res) => {
      ready.then(
        () => forward(port, req, res),
        () => {
          res.writeHead(502, { 'content-type': 'text/plain' })
          res.end('The server did not start; see the log.')
        }
      )
    })
  }
})
