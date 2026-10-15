import { type IpRange, parseRange, type TrustedProxies } from '../ip.ts'

type Parsed<A> = { readonly value: A } | { readonly problem: string }

/**
 * `TRUST_PROXY`: `false` (no proxy is trusted), `true` (every address is), or a comma-separated
 * list of addresses and CIDR ranges (`10.0.0.10,172.18.0.0/16`). Case is ignored for the
 * keywords; each list entry must be an address or a range, so a typo stops startup instead of
 * silently leaving a proxy untrusted (and every client sharing the proxy's rate-limit bucket).
 */
export const parseTrustProxy = (raw: string): Parsed<TrustedProxies> => {
  const keyword = raw.toLowerCase()
  if (keyword === '' || keyword === 'false') return { value: { kind: 'none' } }
  if (keyword === 'true') return { value: { kind: 'all' } }

  const ranges: IpRange[] = []
  for (const entry of raw.split(',')) {
    const range = parseRange(entry)
    if (range === undefined) {
      return {
        problem: `"${entry.trim()}" is not an IP address or CIDR range (use false, true, or a list like 10.0.0.10,172.18.0.0/16)`
      }
    }
    ranges.push(range)
  }
  return { value: { kind: 'list', ranges } }
}

/**
 * `TRUSTED_PLATFORM`: the name of a header the platform sets to the client address. A header name
 * is a token (letters, digits, hyphen); it is lower-cased because headers are case-insensitive.
 * Empty means none.
 */
export const parseTrustedPlatform = (raw: string): Parsed<string | undefined> => {
  if (raw === '') return { value: undefined }
  if (!/^[A-Za-z0-9-]+$/.test(raw)) {
    return { problem: `"${raw}" is not a header name (letters, digits and hyphens only)` }
  }
  return { value: raw.toLowerCase() }
}
