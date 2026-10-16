import { afterEach, describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { serve } from 'h3'
import net from 'node:net'
import { runEffect } from '../src/kernel/http/responder.ts'
import { makeTestApp, type TestApp } from './app.ts'

/**
 * The few behaviours that depend on a real socket and Node's HTTP server, which `app.fetch`
 * cannot show: what the server does when a client really hangs up, and a body limit on bytes that
 * really arrive. The port is ephemeral and bound to loopback.
 */
let t: TestApp | undefined
let server: ReturnType<typeof serve> | undefined

afterEach(async () => {
  await server?.close(true)
  await t?.dispose()
  server = undefined
  t = undefined
})

const listen = async (app: TestApp) => {
  server = serve(app.app, { port: 0, hostname: '127.0.0.1', silent: true, gracefulShutdown: false })
  await server.ready()
  const address = server.node?.server?.address()
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('the server did not report a port')
  }
  return address.port
}

const until = async (condition: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms
  while (!condition() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
  return condition()
}

describe('a client that hangs up', () => {
  it('interrupts the request it left running and frees its slot', async () => {
    t = await makeTestApp()
    let interrupted = false
    t.app.get('/hang', (event) =>
      runEffect(
        event,
        Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          )
        )
      )
    )
    const port = await listen(t)

    const socket = net.connect(port, '127.0.0.1')
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    socket.write('GET /hang HTTP/1.1\r\nHost: x\r\n\r\n')
    expect(await until(() => t!.http.inFlight.active() === 1)).toBe(true)

    socket.destroy()

    expect(await until(() => interrupted)).toBe(true)
    expect(await until(() => t!.http.inFlight.active() === 0)).toBe(true)
  })
})

describe('BODY_LIMIT over a real socket', () => {
  const post = (port: number, body: string) =>
    fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })

  it('refuses a body over the limit with 413, and accepts one under it', async () => {
    t = await makeTestApp({ BODY_LIMIT: '200', RATE_LIMIT_ENABLED: 'false' })
    const port = await listen(t)

    const big = await post(port, JSON.stringify({ email: 'a@b.co', name: 'x'.repeat(500) }))
    expect(big.status).toBe(413)

    const small = await post(port, JSON.stringify({ email: 'a@b.co', name: 'x' }))
    expect(small.status).toBe(201)
  })

  it('counts the bytes that arrive, not the Content-Length that was claimed', async () => {
    t = await makeTestApp({ BODY_LIMIT: '200', RATE_LIMIT_ENABLED: 'false' })
    const port = await listen(t)

    const answer = await new Promise<string>((resolve) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          'POST /api/users HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n' +
            `Content-Length: 10\r\n\r\n{"email":"${'y'.repeat(2000)}`
        )
      })
      let out = ''
      socket.on('data', (chunk) => (out += String(chunk)))
      socket.on('close', () => resolve(out.split('\r\n')[0] ?? ''))
      setTimeout(() => {
        socket.destroy()
        resolve(out.split('\r\n')[0] ?? 'no answer')
      }, 2000)
    })
    // Node's parser stops at the claimed length, so the surplus is a malformed next request.
    expect(answer).toMatch(/^HTTP\/1\.1 (400|413)/)
    expect(t.http.inFlight.active()).toBe(0)
  })
})
