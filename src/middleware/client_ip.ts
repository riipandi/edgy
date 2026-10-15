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
 * The client's address, from the most to the least specific claim, believing only what the
 * configuration says may be believed:
 *
 * 1. **The platform header** (`TRUSTED_PLATFORM`, e.g. `CF-Connecting-IP`), when it holds an
 *    address. It is read without asking who sent the request: set it only when the app cannot be
 *    reached except through that platform. If the header is missing or malformed the socket's
 *    address is used, never `X-Forwarded-For`: the two are alternatives, not fallbacks.
 * 2. **The socket's address**, unless it belongs to a trusted proxy (`TRUST_PROXY`). A request
 *    from anyone else can write `X-Forwarded-For` as it likes, so the headers are ignored.
 * 3. **`X-Forwarded-For`**, read from the right: every proxy adds the address it received the
 *    request from, so the entries to the right are the proxies' own. Entries that belong to
 *    trusted proxies are skipped; the first one that does not is the client. Everything left of
 *    it was written by the client or before our proxies, and a client that forges the header only
 *    lengthens the list on the left. With `TRUST_PROXY=true` every entry is trusted, so the
 *    leftmost wins.
 * 4. **`X-Real-IP`**, when there is no usable `X-Forwarded-For`.
 *
 * A malformed entry ends the search: the socket's address is used rather than guessing. With no
 * address at all the answer is `unknown`, one shared bucket, which is the safe direction to fail.
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
