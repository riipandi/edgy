import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { Plugin } from 'vite'
import { OUT_DIR } from './platform.ts'

/** A free port, assigned by the operating system. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0))
    })
  })

/** Resolves once `port` accepts connections; rejects if the process exits or startup times out. */
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

/** Proxies one request to the built server and streams the answer back. */
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
 * `vite preview` for the Node server: starts the built server on a private port, as `pnpm start`
 * does, and proxies the preview address to it. Vite's preview serves only static files.
 *
 * Registered directly rather than returned, so it runs before Vite's static handler and the build
 * output is never served as files. It does not build.
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
