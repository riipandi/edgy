import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import type { ViteDevServer } from 'vite-plus'
import { afterAll, expect, it } from 'vite-plus/test'
import { effectVite } from '#/builder/vite-plugin.ts'
import { devAccessLog } from '#/middleware/dev-access-log.ts'

// Regression for the dev access-log loss: vite runs the value returned from
// configureServer as a post hook right after the internal middlewares are
// installed — it is not a shutdown hook. An earlier revision disposed the
// dev handler (and the application runtime with it) from that hook, which
// killed every Logger.batched flush loop before the first request: request
// logs buffered into sinks nobody would ever flush. The plugin must keep the
// handler alive across the post hook so access logs still reach their sinks.
const directories: Array<string> = []
const tempDir = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgy-dev-logger-'))
  directories.push(directory)
  return directory
}

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

let directory: string

it(
  'keeps the dev handler logging after the configureServer post hook',
  { timeout: 120_000 },
  async () => {
    directory = tempDir()
    process.env['DATABASE_URL'] = `file:${path.join(directory, 'data', 'app.db')}`
    process.env['LOG_TRANSPORT'] = 'file'
    process.env['LOG_FILE'] = path.join(directory, 'logs', 'app.jsonl')

    const plugin = effectVite({ enabled: true }).find(
      (candidate) => candidate.name === 'effect-server'
    )
    expect(plugin).toBeDefined()
    expect(plugin!.configureServer).toBeTypeOf('function')

    const middlewares: Array<
      (req: IncomingMessage, res: ServerResponse, next: () => void) => void
    > = []
    const fakeServer = {
      config: { mode: 'development' },
      middlewares: { use: (fn: (typeof middlewares)[number]) => middlewares.push(fn) }
    } as unknown as ViteDevServer

    // The plugin's own hook is a plain function; the ObjectHook wrapper type
    // only applies to user-supplied hook objects.
    const hook = plugin!.configureServer as unknown as
      | ((server: ViteDevServer) => unknown)
      | undefined
    expect(hook).toBeTypeOf('function')
    const postHook = await hook!(fakeServer)
    // Vite runs the returned value immediately as a post hook; the plugin
    // must survive that call with its handler still logging.
    if (typeof postHook === 'function') await postHook?.()

    expect(middlewares).toHaveLength(1)
    const respond = (url: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const chunks: Array<Buffer> = []
        const sink = new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(chunk)
            callback()
          }
        })
        const res = Object.assign(sink, {
          statusCode: 0,
          setHeader: () => sink
        }) as unknown as ServerResponse
        sink.on('finish', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() })
        )
        sink.on('error', reject)
        const middleware = middlewares[0]
        if (middleware === undefined) throw new Error('dev middleware was not installed')
        middleware(
          { url, method: 'GET', headers: { host: 'localhost:3000' } } as unknown as IncomingMessage,
          res,
          () => reject(new Error(`no dev middleware handled ${url}`))
        )
      })

    const health = await respond('/api/health')
    expect(health.status).toBe(200)

    // Dev page parity: the Start-side access log records page traffic through
    // the same application runtime, skips Effect-owned paths, and honors the
    // shared quiet list.
    const next = async () => new Response(null, { status: 204 })
    await devAccessLog(new Request('http://localhost:3000/some-page'), next)
    await devAccessLog(new Request('http://localhost:3000/api/health'), next)
    await devAccessLog(new Request('http://localhost:3000/_serverFn/data'), next)

    // The flush window is 250ms; the access record must reach the file sink.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const files = readdirSync(path.join(directory, 'logs'))
    expect(files).toHaveLength(1)
    const contents = readFileSync(path.join(directory, 'logs', files[0]!), 'utf8')
    expect(contents).toContain('/api/health')
    expect(contents).toContain('GET /some-page 204')
    // Effect-owned and quiet paths stay out of the Start-side record.
    expect(contents).not.toContain('GET /api/health 204')
    expect(contents).not.toContain('/_serverFn')
  }
)
