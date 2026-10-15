import { describe, expect, it } from '@effect/vitest'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { Duplex, PassThrough } from 'node:stream'
import { parseRange } from '../ip.ts'
import { acceptProxyProtocol, parseProxyHeader } from './proxy_protocol.ts'

const text = (value: string) => new TextEncoder().encode(value)
const SIGNATURE = [0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a]

const v2 = (command: number, family: number, payload: number[]) =>
  Uint8Array.from([
    ...SIGNATURE,
    0x20 | command,
    family,
    payload.length >> 8,
    payload.length & 0xff,
    ...payload
  ])

describe('parseProxyHeader v1', () => {
  it('reads the client of a TCP4 line and says how many bytes it took', () => {
    const line = 'PROXY TCP4 203.0.113.7 10.0.0.5 51000 443\r\n'
    expect(parseProxyHeader(text(`${line}GET / HTTP/1.1`))).toEqual({
      status: 'ok',
      consumed: line.length,
      client: { address: '203.0.113.7', port: 51000 }
    })
  })

  it('reads a TCP6 line', () => {
    const header = parseProxyHeader(text('PROXY TCP6 2001:db8::1 2001:db8::2 51000 443\r\n'))
    expect(header).toMatchObject({
      status: 'ok',
      client: { address: '2001:db8:0:0:0:0:0:1', port: 51000 }
    })
  })

  it('accepts UNKNOWN without naming a client', () => {
    expect(parseProxyHeader(text('PROXY UNKNOWN\r\n'))).toEqual({ status: 'ok', consumed: 15 })
  })

  it('waits for the rest of a line that has not all arrived', () => {
    expect(parseProxyHeader(text('PROXY TCP4 203.0.113.7 10.0.0'))).toEqual({ status: 'need-more' })
    expect(parseProxyHeader(text('PRO'))).toEqual({ status: 'need-more' })
  })

  it.each([
    'PROXY TCP4 not-an-ip 10.0.0.5 51000 443\r\n',
    'PROXY TCP4 2001:db8::1 10.0.0.5 51000 443\r\n',
    'PROXY TCP4 203.0.113.7 10.0.0.5 99999 443\r\n',
    'PROXY TCP9 203.0.113.7 10.0.0.5 1 2\r\n',
    'PROXY TCP4 203.0.113.7\r\n',
    'GET / HTTP/1.1\r\n',
    `PROXY ${'A'.repeat(200)}`
  ])('refuses %s', (input) => {
    expect(parseProxyHeader(text(input))).toEqual({ status: 'invalid' })
  })
})

describe('parseProxyHeader v2', () => {
  it('reads a TCP4 address block', () => {
    const header = v2(1, 0x11, [203, 0, 113, 7, 10, 0, 0, 5, 0xc7, 0x38, 0x01, 0xbb])
    expect(parseProxyHeader(header)).toEqual({
      status: 'ok',
      consumed: header.length,
      client: { address: '203.0.113.7', port: 51000 }
    })
  })

  it('reads a TCP6 address block', () => {
    const source = [0x20, 0x01, 0x0d, 0xb8, ...new Array(11).fill(0), 1]
    const destination = [0x20, 0x01, 0x0d, 0xb8, ...new Array(11).fill(0), 2]
    const header = v2(1, 0x21, [...source, ...destination, 0xc7, 0x38, 0x01, 0xbb])
    expect(parseProxyHeader(header)).toMatchObject({
      status: 'ok',
      client: { address: '2001:db8:0:0:0:0:0:1', port: 51000 }
    })
  })

  it('treats LOCAL (a balancer health check) as a header with no client', () => {
    const header = v2(0, 0x00, [])
    expect(parseProxyHeader(header)).toEqual({ status: 'ok', consumed: 16 })
  })

  it('waits for a block that has not all arrived, and refuses a wrong version or a huge one', () => {
    const header = v2(1, 0x11, [203, 0, 113, 7, 10, 0, 0, 5, 0xc7, 0x38, 0x01, 0xbb])
    expect(parseProxyHeader(header.subarray(0, 20))).toEqual({ status: 'need-more' })
    expect(parseProxyHeader(header.subarray(0, 5))).toEqual({ status: 'need-more' })

    const wrongVersion = Uint8Array.from(header)
    wrongVersion[12] = 0x11
    expect(parseProxyHeader(wrongVersion)).toEqual({ status: 'invalid' })

    const huge = Uint8Array.from([...SIGNATURE, 0x21, 0x11, 0xff, 0xff])
    expect(parseProxyHeader(huge)).toEqual({ status: 'invalid' })
  })
})

type Socket = PassThrough & {
  remoteAddress: string
  remotePort?: number
  /** Bytes the listener received, in order. */
  chunks: Uint8Array[]
}

/** A server that only knows how to hand a connection to its listeners. */
class FakeServer extends EventEmitter {
  accepted: Socket[] = []
  constructor() {
    super()
    // Node's HTTP server also starts reading as soon as it is handed a connection.
    this.on('connection', (socket: Socket) => {
      socket.on('data', (chunk: Uint8Array) => socket.chunks.push(chunk))
      this.accepted.push(socket)
    })
  }
}

const connect = (server: FakeServer, from: string): Socket => {
  const socket: Socket = Object.assign(new PassThrough(), { remoteAddress: from, chunks: [] })
  server.emit('connection', socket)
  return socket
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('acceptProxyProtocol', () => {
  const trusted = { kind: 'list', ranges: [parseRange('10.0.0.0/8')!] } as const

  it('hands the HTTP parser a socket that names the client and starts at the first request byte', async () => {
    const server = new FakeServer()
    acceptProxyProtocol(server, trusted)
    const socket = connect(server, '10.0.0.5')
    expect(server.accepted).toHaveLength(0)

    socket.write(text('PROXY TCP4 203.0.113.7 10.0.0.5 51000 443\r\nGET / HTTP/1.1\r\n'))
    await settle()
    await settle()

    expect(server.accepted).toEqual([socket])
    expect(socket.remoteAddress).toBe('203.0.113.7')
    expect(socket.remotePort).toBe(51000)
    expect(Buffer.concat(socket.chunks).toString()).toBe('GET / HTTP/1.1\r\n')
  })

  it('copes with a header that arrives in pieces', async () => {
    const server = new FakeServer()
    acceptProxyProtocol(server, trusted)
    const socket = connect(server, '10.0.0.5')

    socket.write(text('PROXY TCP4 203.0.113.7 10.0.'))
    await settle()
    expect(server.accepted).toHaveLength(0)

    socket.write(text('0.5 51000 443\r\nGET'))
    await settle()
    await settle()
    expect(server.accepted).toHaveLength(1)
    expect(socket.remoteAddress).toBe('203.0.113.7')
    expect(Buffer.concat(socket.chunks).toString()).toBe('GET')
  })

  it('serves a peer that is not trusted as it is, even if it sends a header', async () => {
    const server = new FakeServer()
    acceptProxyProtocol(server, trusted)
    const socket = connect(server, '198.51.100.9')

    expect(server.accepted).toEqual([socket])
    expect(socket.remoteAddress).toBe('198.51.100.9')
  })

  it('disconnects a trusted peer that does not open with a header', async () => {
    const server = new FakeServer()
    acceptProxyProtocol(server, trusted)
    const socket = connect(server, '10.0.0.5')

    socket.write(text('GET / HTTP/1.1\r\n\r\n'))
    await settle()

    expect(server.accepted).toHaveLength(0)
    expect(socket.destroyed).toBe(true)
  })

  it('does nothing when no balancer is listed', () => {
    const server = new FakeServer()
    acceptProxyProtocol(server, { kind: 'none' })
    const socket = connect(server, '10.0.0.5')
    expect(server.accepted).toEqual([socket])
  })
})

describe("acceptProxyProtocol with Node's HTTP server", () => {
  it('serves the request that follows the header, and the handler sees the client', async () => {
    const seen: (string | undefined)[] = []
    const server = createServer((req, res) => {
      seen.push(req.socket.remoteAddress)
      res.end('hello')
    })
    acceptProxyProtocol(server, { kind: 'list', ranges: [parseRange('10.0.0.0/8')!] })

    // A connection without a port: a duplex whose reads are fed by the test, writes collected.
    const written: Buffer[] = []
    const socket = Object.assign(
      new Duplex({
        read() {},
        write(chunk: Buffer, _encoding, done) {
          written.push(chunk)
          done()
        }
      }),
      { remoteAddress: '10.0.0.5' }
    )
    server.emit('connection', socket)

    socket.push(
      Buffer.from(
        'PROXY TCP4 203.0.113.7 10.0.0.5 51000 443\r\nGET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(seen).toEqual(['203.0.113.7'])
    expect(Buffer.concat(written).toString()).toContain('200 OK')
    expect(Buffer.concat(written).toString()).toContain('hello')
    socket.destroy()
  })
})
