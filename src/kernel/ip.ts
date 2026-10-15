/**
 * IP addresses and CIDR ranges as plain bytes, not `node:net`'s `BlockList`: the Workers bundle
 * cannot depend on Node-only modules. An IPv4-mapped IPv6 address (`::ffff:10.0.0.1`, what a
 * dual-stack socket reports for an IPv4 peer) counts as its 4 bytes, so an IPv4 range matches it.
 */

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

const parseV4 = (text: string): Uint8Array | undefined => {
  const match = V4.exec(text)
  if (match === null) return undefined
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i += 1) {
    const octet = Number(match[i + 1])
    if (octet > 255) return undefined
    bytes[i] = octet
  }
  return bytes
}

const parseV6 = (text: string): Uint8Array | undefined => {
  let body = text
  const zone = body.indexOf('%')
  if (zone !== -1) body = body.slice(0, zone)
  if (body.length < 2 || !body.includes(':')) return undefined

  // An embedded IPv4 tail (`::ffff:1.2.3.4`) is two hextets.
  const lastColon = body.lastIndexOf(':')
  const tail = body.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseV4(tail)
    if (v4 === undefined) return undefined
    const hex = (a: number, b: number) => (((a << 8) | b) >>> 0).toString(16)
    body = `${body.slice(0, lastColon + 1)}${hex(v4[0] ?? 0, v4[1] ?? 0)}:${hex(v4[2] ?? 0, v4[3] ?? 0)}`
  }

  const halves = body.split('::')
  if (halves.length > 2) return undefined
  const groups = (part: string): string[] | undefined => {
    if (part === '') return []
    const list = part.split(':')
    return list.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group)) ? list : undefined
  }
  const head = groups(halves[0] ?? '')
  const rest = halves.length === 2 ? groups(halves[1] ?? '') : []
  if (head === undefined || rest === undefined) return undefined

  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined

  const all = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'),
    ...rest
  ]
  const bytes = new Uint8Array(16)
  all.forEach((group, i) => {
    const value = Number.parseInt(group, 16)
    bytes[i * 2] = value >> 8
    bytes[i * 2 + 1] = value & 255
  })

  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255
  return mapped ? bytes.slice(12) : bytes
}

/**
 * Parses an address from a socket, `X-Forwarded-For` or a platform header. Brackets, a port
 * (`1.2.3.4:5678`, `[::1]:80`) and a zone id are accepted; `undefined` if it is not an address.
 */
export const parseIp = (input: string): Uint8Array | undefined => {
  let text = input.trim()
  if (text.startsWith('[')) {
    const close = text.indexOf(']')
    if (close === -1) return undefined
    const port = text.slice(close + 1)
    if (port !== '' && !/^:\d{1,5}$/.test(port)) return undefined
    text = text.slice(1, close)
  } else if (text.includes('.') && text.includes(':') && !text.includes('::')) {
    // `1.2.3.4:5678`. `::ffff:1.2.3.4` contains `::` and is left alone.
    const colon = text.lastIndexOf(':')
    if (/^\d{1,5}$/.test(text.slice(colon + 1)) && !text.slice(0, colon).includes(':')) {
      text = text.slice(0, colon)
    }
  }
  return text.includes(':') ? parseV6(text) : parseV4(text)
}

/** Canonical text: dotted decimal for IPv4, eight lower-case hextets for IPv6. */
export const formatIp = (bytes: Uint8Array): string => {
  if (bytes.length === 4) return bytes.join('.')
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) {
    groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16))
  }
  return groups.join(':')
}

/** A network: an address and how many leading bits of it must match. */
export interface IpRange {
  readonly bytes: Uint8Array
  readonly prefix: number
}

/** `10.0.0.10`, `172.18.0.0/16`, `fd00::/8`, `::1`; a bare address is a range of one. */
export const parseRange = (text: string): IpRange | undefined => {
  const [address, length, ...extra] = text.trim().split('/')
  if (extra.length > 0 || address === undefined) return undefined
  const bytes = parseIp(address)
  if (bytes === undefined) return undefined
  const max = bytes.length * 8
  if (length === undefined) return { bytes, prefix: max }
  if (!/^\d{1,3}$/.test(length) || Number(length) > max) return undefined
  return { bytes, prefix: Number(length) }
}

/** Whether `ip` lies inside `range`. Families never mix: IPv4 never matches an IPv6 range. */
export const inRange = (ip: Uint8Array, range: IpRange): boolean => {
  if (ip.length !== range.bytes.length) return false
  const whole = Math.floor(range.prefix / 8)
  for (let i = 0; i < whole; i += 1) if (ip[i] !== range.bytes[i]) return false
  const rest = range.prefix % 8
  if (rest === 0) return true
  const mask = (0xff << (8 - rest)) & 0xff
  return ((ip[whole] ?? 0) & mask) === ((range.bytes[whole] ?? 0) & mask)
}

/** Which proxies may speak for a client (`TRUST_PROXY`). */
export type TrustedProxies =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'list'; readonly ranges: readonly IpRange[] }

/** Whether `ip` belongs to a proxy we trust. */
export const isTrustedProxy = (ip: Uint8Array, trusted: TrustedProxies): boolean =>
  trusted.kind === 'all' || (trusted.kind === 'list' && trusted.ranges.some((r) => inRange(ip, r)))
