import { type IpRange, parseRange, type TrustedProxies } from '../ip.ts'

type Parsed<A> = { readonly value: A } | { readonly problem: string }

/**
 * `TRUST_PROXY`: `false`, `true`, or a comma-separated list of addresses and CIDR ranges. Each
 * list entry must parse: a typo would leave the proxy untrusted, putting every client in the
 * proxy's rate-limit bucket, so startup fails instead.
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

/** `TRUSTED_PLATFORM`: a header the platform sets to the client address. Empty means none. */
export const parseTrustedPlatform = (raw: string): Parsed<string | undefined> => {
  if (raw === '') return { value: undefined }
  if (!/^[A-Za-z0-9-]+$/.test(raw)) {
    return { problem: `"${raw}" is not a header name (letters, digits and hyphens only)` }
  }
  return { value: raw.toLowerCase() }
}
