import type { Duplex } from 'node:stream'
import { formatIp, isTrustedProxy, parseIp, type TrustedProxies } from '../ip.ts'

/** The PROXY protocol v2 signature: twelve bytes no HTTP request can start with. */
const V2_SIGNATURE = Uint8Array.from([
  0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a
])

/** Longest v1 line, CRLF included. */
const V1_MAX = 107

/** Longest v2 address block accepted. The spec allows more; no balancer here needs it. */
const V2_MAX_PAYLOAD = 536

/** How long a trusted peer may take to send its header before the connection is dropped. */
const HEADER_TIMEOUT_MS = 5_000

/** What the header said about the connection it opened. */
export type ProxyHeader =
  | { readonly status: 'need-more' }
  | { readonly status: 'invalid' }
  | {
      readonly status: 'ok'
      /** Bytes the header took; whatever follows is the start of the real stream. */
      readonly consumed: number
      /** The client, absent for `LOCAL` / `UNKNOWN`, where the peer's own address is the answer. */
      readonly client?: { readonly address: string; readonly port: number }
    }

const startsWith = (buffer: Uint8Array, prefix: Uint8Array): boolean =>
  buffer.length >= prefix.length && prefix.every((byte, i) => buffer[i] === byte)

const parseV1 = (buffer: Uint8Array): ProxyHeader => {
  const limit = Math.min(buffer.length, V1_MAX)
  let end = -1
  for (let i = 0; i < limit - 1; i += 1) {
    if (buffer[i] === 0x0d && buffer[i + 1] === 0x0a) {
      end = i
      break
    }
  }
  if (end === -1) return buffer.length >= V1_MAX ? { status: 'invalid' } : { status: 'need-more' }

  const parts = new TextDecoder('ascii').decode(buffer.subarray(0, end)).split(' ')
  const consumed = end + 2
  if (parts[1] === 'UNKNOWN') return { status: 'ok', consumed }
  if ((parts[1] !== 'TCP4' && parts[1] !== 'TCP6') || parts.length !== 6)
    return { status: 'invalid' }

  const source = parseIp(parts[2] ?? '')
  const port = Number(parts[4])
  const wantsLength = parts[1] === 'TCP4' ? 4 : 16
  // `::ffff:a.b.c.d` parses to the IPv4 bytes, so an IPv6 line may carry either length.
  if (source === undefined || !Number.isInteger(port) || port < 0 || port > 65_535) {
    return { status: 'invalid' }
  }
  if (parts[1] === 'TCP4' && source.length !== wantsLength) return { status: 'invalid' }
  return { status: 'ok', consumed, client: { address: formatIp(source), port } }
}

const parseV2 = (buffer: Uint8Array): ProxyHeader => {
  if (buffer.length < 16) return { status: 'need-more' }
  const versionAndCommand = buffer[12] ?? 0
  const familyAndProtocol = buffer[13] ?? 0
  const length = ((buffer[14] ?? 0) << 8) | (buffer[15] ?? 0)
  if (versionAndCommand >> 4 !== 2 || length > V2_MAX_PAYLOAD) return { status: 'invalid' }
  const consumed = 16 + length
  if (buffer.length < consumed) return { status: 'need-more' }

  const command = versionAndCommand & 0x0f
  if (command === 0) return { status: 'ok', consumed } // LOCAL: the balancer's own health check
  if (command !== 1) return { status: 'invalid' }

  const family = familyAndProtocol >> 4
  const stream = (familyAndProtocol & 0x0f) === 1
  const block = buffer.subarray(16, consumed)
  const addressLength = family === 1 ? 4 : family === 2 ? 16 : 0
  if (!stream || addressLength === 0) return { status: 'ok', consumed }
  if (block.length < addressLength * 2 + 4) return { status: 'invalid' }

  const address = formatIp(block.subarray(0, addressLength))
  const port = ((block[addressLength * 2] ?? 0) << 8) | (block[addressLength * 2 + 1] ?? 0)
  return { status: 'ok', consumed, client: { address, port } }
}

/**
 * Reads a PROXY protocol header (v1 text or v2 binary) at the start of a connection. Pure: returns
 * what the bytes mean and how many of them the header used, or `need-more` while it is incomplete.
 */
export const parseProxyHeader = (buffer: Uint8Array): ProxyHeader => {
  if (buffer.length === 0) return { status: 'need-more' }
  const v1 = new TextEncoder().encode('PROXY ')
  if (startsWith(buffer, v1)) return parseV1(buffer)
  if (startsWith(buffer, V2_SIGNATURE)) return parseV2(buffer)
  // A prefix of either signature may still become one.
  const sample = buffer.subarray(0, 12)
  const couldBeV1 = v1
    .subarray(0, Math.min(sample.length, v1.length))
    .every((b, i) => b === sample[i])
  const couldBeV2 = V2_SIGNATURE.subarray(0, sample.length).every((b, i) => b === sample[i])
  return (couldBeV1 && sample.length < v1.length) || (couldBeV2 && sample.length < 12)
    ? { status: 'need-more' }
    : { status: 'invalid' }
}

/** The part of an HTTP server this needs: its listeners for new connections. */
interface ConnectionSource {
  listeners(event: 'connection'): ((socket: Duplex) => void)[]
  removeAllListeners(event: 'connection'): unknown
  on(event: 'connection', listener: (socket: Duplex) => void): unknown
}

/** A socket with the peer address fields that this module redefines. */
type PeerSocket = Duplex & { remoteAddress?: string; remotePort?: number }

/**
 * Reads a PROXY protocol header from trusted peers, and reports the client it names instead of
 * the load balancer.
 *
 * The header precedes HTTP, so the server's own `connection` listeners are detached and run only
 * after the header is consumed; the bytes after it are pushed back. `remoteAddress` and
 * `remotePort` are then redefined on the socket, which is where srvx and h3 read the client from,
 * so rate limiting, `TRUST_PROXY` and logs all see the real client.
 *
 * - A peer not in `trusted` passes straight through, header or not: a header cannot prove that
 *   its sender is a balancer, so only the socket's own address decides.
 * - A trusted peer must send a valid header within `HEADER_TIMEOUT_MS`, or it is disconnected. A
 *   balancer configured without PROXY protocol would otherwise make every client look like it.
 */
export const acceptProxyProtocol = (server: ConnectionSource, trusted: TrustedProxies): void => {
  if (trusted.kind === 'none') return
  const handlers = server.listeners('connection')
  server.removeAllListeners('connection')

  server.on('connection', (socket: PeerSocket) => {
    const peer = socket.remoteAddress === undefined ? undefined : parseIp(socket.remoteAddress)
    if (peer === undefined || !isTrustedProxy(peer, trusted)) {
      for (const handler of handlers) handler.call(server, socket)
      return
    }

    let received: Uint8Array = new Uint8Array(0)
    const timer = setTimeout(() => socket.destroy(), HEADER_TIMEOUT_MS)
    timer.unref()

    const onData = (chunk: Uint8Array) => {
      const next = new Uint8Array(received.length + chunk.length)
      next.set(received)
      next.set(chunk, received.length)
      received = next

      const header = parseProxyHeader(received)
      if (header.status === 'need-more') return
      socket.off('data', onData)
      socket.off('error', onError)
      clearTimeout(timer)
      if (header.status === 'invalid') {
        socket.destroy()
        return
      }

      if (header.client !== undefined) {
        Object.defineProperty(socket, 'remoteAddress', {
          value: header.client.address,
          configurable: true
        })
        Object.defineProperty(socket, 'remotePort', {
          value: header.client.port,
          configurable: true
        })
      }
      const rest = received.subarray(header.consumed)
      if (rest.length > 0) socket.unshift(Buffer.from(rest))
      for (const handler of handlers) handler.call(server, socket)
    }

    // Until the handlers take over there is no 'error' listener, and a reset would crash the process.
    const onError = () => socket.destroy()
    socket.on('error', onError)
    socket.on('data', onData)
    socket.once('close', () => {
      clearTimeout(timer)
      socket.off('error', onError)
    })
  })
}
