import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { createServer as createHttpServer } from 'node:http'
import path from 'node:path'
import { Duplex } from 'node:stream'
import { createServer, type ViteDevServer } from 'vite'

/** Sends one request through Node's real HTTP parser and handlers, without a port. */
const send = async (
  handler: Parameters<typeof createHttpServer>[1],
  requestLine: string,
  options: { readonly headers?: readonly string[]; readonly body?: string } = {}
): Promise<{ status: number; headers: string; body: string }> => {
  const server = createHttpServer(handler)
  const written: Buffer[] = []
  const socket = Object.assign(
    new Duplex({
      read() {},
      write(chunk: Buffer, _encoding, done) {
        written.push(chunk)
        done()
      }
    }),
    { remoteAddress: '127.0.0.1' }
  )
  server.emit('connection', socket)
  const headers = ['Host: localhost', 'Connection: close', ...(options.headers ?? [])]
  socket.push(Buffer.from(`${requestLine}\r\n${headers.join('\r\n')}\r\n\r\n${options.body ?? ''}`))

  const deadline = Date.now() + 8000
  let text = ''
  while (Date.now() < deadline) {
    text = Buffer.concat(written).toString()
    if (
      text.includes('\r\n\r\n') &&
      (text.includes('0\r\n\r\n') || /content-length: \d+/i.test(text))
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
  text = Buffer.concat(written).toString()
  socket.destroy()
  const [head = '', ...rest] = text.split('\r\n\r\n')
  return {
    status: Number(/HTTP\/1\.1 (\d{3})/.exec(head)?.[1]),
    headers: head,
    body: rest.join('\r\n\r\n')
  }
}

let vite: ViteDevServer
const root = path.resolve(import.meta.dirname, '..')

beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'None',
    OTEL_SDK_DISABLED: 'true',
    // Set explicitly, so a developer's `.env.local` cannot change the test.
    DATABASE_AUTO_MIGRATE: 'true'
  })
  vite = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    configLoader: 'runner',
    logLevel: 'silent',
    // No port, socket or file watcher. The test emits watcher events by hand.
    server: { middlewareMode: true, ws: false, watch: null },
    mode: 'development'
  })
}, 60_000)

afterAll(async () => {
  await vite.close()
})

describe('the Vite dev server running the application', () => {
  it('answers pages, the API and errors from the one server', async () => {
    const page = await send(vite.middlewares, 'GET /users HTTP/1.1')
    expect(page.status).toBe(200)
    expect(page.headers.toLowerCase()).toContain('text/html')
    expect(page.body).toContain('<title>Users</title>')

    const api = await send(vite.middlewares, 'GET /api/users HTTP/1.1')
    expect(api.status).toBe(200)
    expect(api.headers.toLowerCase()).toContain('application/json')

    const missing = await send(vite.middlewares, 'GET /nope HTTP/1.1')
    expect(missing.status).toBe(404)
    expect(missing.headers.toLowerCase()).toContain('text/html')
  }, 60_000)

  it('widens the page policy for Vite, as only development does', async () => {
    const page = await send(vite.middlewares, 'GET / HTTP/1.1')
    expect(page.headers).toMatch(/content-security-policy: [^\r]*style-src 'self' 'unsafe-inline'/i)
  }, 60_000)

  it('lets Vite answer its own requests before the application', async () => {
    const client = await send(vite.middlewares, 'GET /@vite/client HTTP/1.1')
    expect(client.status).toBe(200)
    expect(client.headers.toLowerCase()).toMatch(/javascript/)
  }, 60_000)
})

describe('changing server code', () => {
  it('starts the application over in the same process, and ignores files that are not server code', async () => {
    const body = JSON.stringify({ email: 'ada@example.com', name: 'Ada' })
    const created = await send(vite.middlewares, 'POST /api/users HTTP/1.1', {
      headers: ['Content-Type: application/json', `Content-Length: ${body.length}`],
      body
    })
    expect(created.status).toBe(201)
    expect((await send(vite.middlewares, 'GET /api/users HTTP/1.1')).body).toContain(
      'ada@example.com'
    )

    // Test files and pages are not server code, so the application and its data stay.
    vite.watcher.emit('all', 'change', path.join(root, 'src/app.test.ts'))
    vite.watcher.emit('all', 'change', path.join(root, 'app/pages/users.marko'))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect((await send(vite.middlewares, 'GET /api/users HTTP/1.1')).body).toContain(
      'ada@example.com'
    )

    // Server code starts a new application over a fresh in-memory database.
    vite.watcher.emit('all', 'change', path.join(root, 'src/app.ts'))
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const after = await send(vite.middlewares, 'GET /api/users HTTP/1.1')
    expect(after.status).toBe(200)
    expect(after.body).not.toContain('ada@example.com')
  }, 60_000)
})
