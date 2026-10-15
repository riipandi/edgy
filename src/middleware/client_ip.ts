import { getRequestIP, type H3Event } from 'h3'
import { formatIp, isTrustedProxy, parseIp, type TrustedProxies } from '../kernel/ip.ts'

/** What decides whose word about the client's address is believed. */
export interface ClientIpTrust {
  /** Proxies that may set the address in `X-Forwarded-For` / `X-Real-IP` (`TRUST_PROXY`). */
  readonly proxies: TrustedProxies
  /** A header a platform sets to the client address, lower-cased (`TRUSTED_PLATFORM`). */
  readonly platformHeader: string | undefined
}

/** The pieces of a request the address is worked out from. */
export interface ClientIpInput {
  /** The address of the TCP peer; `undefined` where there is no socket (Workers, tests). */
  readonly socket: string | undefined
  readonly headers: Pick<Headers, 'get'>
}

/**
 * The client's address, from the most to the least specific claim. Only headers the
 * configuration trusts are read:
 *
 * 1. The platform header (`TRUSTED_PLATFORM`, e.g. `CF-Connecting-IP`), when it holds an
 *    address. It is read without checking the sender, so set it only when the app is reachable
 *    solely through that platform. If it is missing or malformed, the socket address is used,
 *    never `X-Forwarded-For`: the two are alternatives, not fallbacks.
 * 2. The socket address, unless it belongs to a trusted proxy (`TRUST_PROXY`). Any other peer
 *    can send any `X-Forwarded-For`, so its headers are ignored.
 * 3. `X-Forwarded-For`, read from the right. Each proxy appends the address it received the
 *    request from, so entries belonging to trusted proxies are skipped and the first other
 *    entry is the client. Entries further left were written by the client or by earlier
 *    proxies. A forged header only adds entries on the left, so it cannot change the result.
 *    With `TRUST_PROXY=true` every entry is trusted, so the leftmost wins.
 * 4. `X-Real-IP`, when there is no usable `X-Forwarded-For`.
 *
 * A malformed entry ends the search and the socket address is used. With no address at all
 * the result is `unknown`, one shared bucket, which fails in the safe direction.
 */
export const clientAddress = (input: ClientIpInput, trust: ClientIpTrust): string => {
  const socket = input.socket === undefined ? undefined : parseIp(input.socket)
  const fallback =
    socket !== undefined ? formatIp(socket) : ((input.socket?.trim() || undefined) ?? 'unknown')

  if (trust.platformHeader !== undefined) {
    const claimed = input.headers.get(trust.platformHeader)
    const bytes = claimed === null ? undefined : parseIp(claimed)
    return bytes === undefined ? fallback : formatIp(bytes)
  }

  if (trust.proxies.kind === 'none') return fallback
  if (socket === undefined || !isTrustedProxy(socket, trust.proxies)) return fallback

  const forwarded = input.headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    let client: Uint8Array | undefined
    const entries = forwarded.split(',')
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const bytes = parseIp(entries[i] ?? '')
      if (bytes === undefined) return fallback
      client = bytes
      if (!isTrustedProxy(bytes, trust.proxies)) break
    }
    return client === undefined ? fallback : formatIp(client)
  }

  const real = input.headers.get('x-real-ip')
  const bytes = real === null ? undefined : parseIp(real)
  return bytes === undefined ? fallback : formatIp(bytes)
}

/** The resolver for a request, bound to the configured trust. */
export const makeClientResolver =
  (trust: ClientIpTrust) =>
  (event: H3Event): string =>
    clientAddress({ socket: getRequestIP(event), headers: event.req.headers }, trust)

/** Where the client is, as far as the platform in front says. */
export interface ClientLocation {
  /** ISO 3166-1 alpha-2 (`ID`), or Cloudflare's `T1` for Tor. Absent when unknown. */
  readonly country?: string
  readonly city?: string
}

/**
 * The client's country and city from Cloudflare's `CF-IPCountry` / `CF-IPCity`, or `undefined`
 * when they must not be believed.
 *
 * Any client can send those headers to a server Cloudflare does not front, so they count only
 * when `CLOUDFLARE_LOCATION_HEADERS` is on and the platform header (`TRUSTED_PLATFORM`) holds a
 * valid address on this request. Both values are sanitised because they are written to logs:
 * a country is two letters or digits (`XX`, unknown, is dropped), a city is printable and at
 * most 64 characters.
 */
export const clientLocation = (
  headers: Pick<Headers, 'get'>,
  trust: { readonly enabled: boolean; readonly platformHeader: string | undefined }
): ClientLocation | undefined => {
  if (!trust.enabled || trust.platformHeader === undefined) return undefined
  const claimed = headers.get(trust.platformHeader)
  if (claimed === null || parseIp(claimed) === undefined) return undefined

  const country = headers.get('cf-ipcountry')?.trim().toUpperCase()
  const city = (headers.get('cf-ipcity') ?? '')
    .split('')
    .filter((char) => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('')
    .trim()
    .slice(0, 64)

  const location: { country?: string; city?: string } = {}
  if (country !== undefined && /^[A-Z][A-Z0-9]$/.test(country) && country !== 'XX') {
    location.country = country
  }
  if (city !== '') location.city = city
  return location.country === undefined && location.city === undefined ? undefined : location
}
