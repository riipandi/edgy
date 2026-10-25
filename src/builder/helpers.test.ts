import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { assertNoExternalImports, packageNameFor, toRequest, writeResponse } from './helpers.ts'

const roots: Array<string> = []
const tempRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'edgy-builder-'))
  roots.push(root)
  return root
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** Serves one request through the builder's request/response adapters. */
const withAdapter = async (
  respond: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  run: (url: string) => Promise<void>
) => {
  let captured: IncomingMessage | undefined
  const server = createServer((req, res) => {
    captured = req
    void respond(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${port}`)
    return captured
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('toRequest', () => {
  it('carries the URL, method, headers, and a POST body', async () => {
    const captured = await withAdapter(
      async (req, res) => {
        const request = toRequest(req)
        const body = await request.text()
        res.end(
          JSON.stringify({
            url: request.url,
            method: request.method,
            multi: request.headers.get('x-multi'),
            body
          })
        )
      },
      async (base) => {
        const raw = await new Promise<string>((resolve, reject) => {
          // node's http client is the one way to put a repeated header on the
          // wire, which is the branch of toRequest under test here.
          const request = httpRequest(
            `${base}/api/users?page=2`,
            { method: 'POST', headers: { 'x-multi': ['a', 'b'] } },
            (response) => {
              let data = ''
              response.on('data', (chunk) => {
                data += chunk
              })
              response.on('end', () => resolve(data))
            }
          )
          request.on('error', reject)
          request.end('payload')
        })
        const echoed = JSON.parse(raw) as Record<string, unknown>
        expect(echoed.url).toBe(`${base}/api/users?page=2`)
        expect(echoed.method).toBe('POST')
        expect(echoed.multi).toBe('a, b')
        expect(echoed.body).toBe('payload')
      }
    )
    expect(captured).toBeDefined()
  })

  it('builds GET requests without a body', async () => {
    await withAdapter(
      async (req, res) => {
        const request = toRequest(req)
        res.end(String(request.body === null))
      },
      async (base) => {
        const response = await fetch(`${base}/health`)
        expect(await response.text()).toBe('true')
      }
    )
  })
})

describe('writeResponse', () => {
  it('writes the status, headers, and body', async () => {
    await withAdapter(
      async (req, res) => {
        await writeResponse(
          req,
          res,
          new Response('hello', { status: 201, headers: { 'x-trace': 'trace-1' } })
        )
      },
      async (base) => {
        const response = await fetch(`${base}/created`)
        expect(response.status).toBe(201)
        expect(response.headers.get('x-trace')).toBe('trace-1')
        expect(await response.text()).toBe('hello')
      }
    )
  })

  it('carries multiple set-cookie headers', async () => {
    await withAdapter(
      async (req, res) => {
        const response = new Response('ok')
        response.headers.append('set-cookie', 'a=1')
        response.headers.append('set-cookie', 'b=2')
        await writeResponse(req, res, response)
      },
      async (base) => {
        const response = await fetch(`${base}/login`)
        expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
      }
    )
  })

  it('drops the body for HEAD requests', async () => {
    await withAdapter(
      async (req, res) => {
        await writeResponse(req, res, new Response('secret body'))
      },
      async (base) => {
        const response = await fetch(`${base}/resource`, { method: 'HEAD' })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('')
      }
    )
  })
})

describe('assertNoExternalImports', () => {
  it('accepts relative, absolute-path, and node: specifiers', () => {
    const root = tempRoot()
    writeFileSync(
      path.join(root, 'entry.js'),
      [
        `import { effect } from './local.js'`,
        `import { strict } from '#/kernel/config/app.ts'`,
        `import fs from 'node:fs'`,
        `export const load = () => import('./lazy.js')`
      ].join('\n')
    )
    expect(() => assertNoExternalImports(root)).not.toThrow()
  })

  it('reports bare specifiers, including dynamic imports, across subdirectories', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, 'chunks'), { recursive: true })
    writeFileSync(path.join(root, 'entry.js'), `import { x } from 'left-pad'\n`)
    writeFileSync(
      path.join(root, 'chunks', 'lazy.js'),
      `export const load = () => import('ghost')\n`
    )
    let message = ''
    try {
      assertNoExternalImports(root)
    } catch (error) {
      message = String(error)
    }
    expect(message).toContain('leaked external imports')
    expect(message).toContain('left-pad (entry.js)')
    expect(message).toContain('ghost (chunks/lazy.js)')
  })

  it('ignores quoted imports inside strings and non-JS files', () => {
    const root = tempRoot()
    writeFileSync(path.join(root, 'prose.js'), `const prose = "import y from 'fake-one'"\n`)
    writeFileSync(path.join(root, 'note.txt'), `import 'fake-two'\n`)
    expect(() => assertNoExternalImports(root)).not.toThrow()
  })

  it('skips the copied node_modules directory', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, 'node_modules', 'vendor'), { recursive: true })
    writeFileSync(
      path.join(root, 'node_modules', 'vendor', 'index.js'),
      `import x from 'some-package'\n`
    )
    expect(() => assertNoExternalImports(root)).not.toThrow()
  })
})

describe('packageNameFor', () => {
  it('names chunks after the package behind a pnpm store path', () => {
    expect(
      packageNameFor('/repo/node_modules/.pnpm/effect@4.0.6/node_modules/effect/dist/index.js')
    ).toBe('effect')
    expect(
      packageNameFor(
        '/repo/node_modules/.pnpm/@effect+platform-node@1.0.0/node_modules/@effect/platform-node/dist/index.js'
      )
    ).toBe('@effect__platform-node')
  })

  it('keeps modules outside any package in the entry chunk', () => {
    expect(packageNameFor('/repo/src/entry.ts')).toBeNull()
  })

  it('drops packages that cannot be resolved', () => {
    expect(
      packageNameFor('/repo/node_modules/.pnpm/ghost@1.0.0/node_modules/ghost-package/index.js')
    ).toBeNull()
  })
})
