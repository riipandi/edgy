import { describe, expect, it } from '@effect/vitest'
import { parseRange, type TrustedProxies } from '../kernel/ip.ts'
import { clientAddress, type ClientIpTrust } from './client_ip.ts'

const list = (...ranges: string[]): TrustedProxies => ({
  kind: 'list',
  ranges: ranges.map((range) => {
    const parsed = parseRange(range)
    if (parsed === undefined) throw new Error(`bad range ${range}`)
    return parsed
  })
})

const NONE: ClientIpTrust = { proxies: { kind: 'none' }, platformHeader: undefined }

const resolve = (
  trust: ClientIpTrust,
  socket: string | undefined,
  headers: Record<string, string> = {}
) => clientAddress({ socket, headers: new Headers(headers) }, trust)

describe('with no trusted proxy', () => {
  it('is the socket address, whatever the headers say', () => {
    expect(
      resolve(NONE, '198.51.100.9', { 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' })
    ).toBe('198.51.100.9')
  })

  it('writes an IPv4-mapped socket address as IPv4, and says unknown with no socket', () => {
    expect(resolve(NONE, '::ffff:198.51.100.9')).toBe('198.51.100.9')
    expect(resolve(NONE, undefined)).toBe('unknown')
  })
})

describe('with a list of trusted proxies', () => {
  const trust: ClientIpTrust = {
    proxies: list('10.0.0.10', '172.18.0.0/16'),
    platformHeader: undefined
  }

  it('believes X-Forwarded-For from a trusted proxy', () => {
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': '203.0.113.5' })).toBe('203.0.113.5')
  })

  it('does not believe it from anyone else', () => {
    expect(resolve(trust, '198.51.100.9', { 'x-forwarded-for': '203.0.113.5' })).toBe(
      '198.51.100.9'
    )
  })

  it('skips trusted proxies from the right and takes the first address that is not one', () => {
    const headers = { 'x-forwarded-for': '9.9.9.9, 203.0.113.5, 172.18.0.7' }
    expect(resolve(trust, '10.0.0.10', headers)).toBe('203.0.113.5')
  })

  it('is not moved by entries a client put on the left', () => {
    const headers = { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.5' }
    expect(resolve(trust, '10.0.0.10', headers)).toBe('203.0.113.5')
  })

  it('takes the leftmost when every entry is a trusted proxy', () => {
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': '172.18.0.2, 172.18.0.3' })).toBe(
      '172.18.0.2'
    )
  })

  it('falls back to X-Real-IP, from a trusted proxy only', () => {
    expect(resolve(trust, '10.0.0.10', { 'x-real-ip': '203.0.113.5' })).toBe('203.0.113.5')
    expect(resolve(trust, '198.51.100.9', { 'x-real-ip': '203.0.113.5' })).toBe('198.51.100.9')
  })

  it('uses the socket address when the header is malformed, rather than guessing', () => {
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': 'unknown' })).toBe('10.0.0.10')
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': '203.0.113.5, not-an-ip' })).toBe(
      '10.0.0.10'
    )
  })

  it('reads an address with a port, and an IPv6 one', () => {
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': '203.0.113.5:4711' })).toBe(
      '203.0.113.5'
    )
    expect(resolve(trust, '10.0.0.10', { 'x-forwarded-for': '[2001:db8::1]:80' })).toBe(
      '2001:db8:0:0:0:0:0:1'
    )
  })

  it('matches a proxy reached over a dual-stack socket', () => {
    expect(resolve(trust, '::ffff:10.0.0.10', { 'x-forwarded-for': '203.0.113.5' })).toBe(
      '203.0.113.5'
    )
  })
})

describe('with every address trusted', () => {
  it('takes the leftmost X-Forwarded-For entry, from any socket', () => {
    const trust: ClientIpTrust = { proxies: { kind: 'all' }, platformHeader: undefined }
    expect(resolve(trust, '198.51.100.9', { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })).toBe(
      '203.0.113.5'
    )
  })
})

describe('with a trusted platform header', () => {
  const trust: ClientIpTrust = { proxies: { kind: 'none' }, platformHeader: 'cf-connecting-ip' }

  it('reads it directly, whatever the socket is', () => {
    expect(resolve(trust, undefined, { 'cf-connecting-ip': '203.0.113.5' })).toBe('203.0.113.5')
    expect(resolve(trust, '198.51.100.9', { 'cf-connecting-ip': '2001:db8::1' })).toBe(
      '2001:db8:0:0:0:0:0:1'
    )
  })

  it('prefers it to X-Forwarded-For, which it replaces', () => {
    const both: ClientIpTrust = { proxies: { kind: 'all' }, platformHeader: 'cf-connecting-ip' }
    expect(
      resolve(both, '10.0.0.1', { 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.1.1.1' })
    ).toBe('203.0.113.5')
  })

  it('falls back to the socket, not X-Forwarded-For, when the header is missing or malformed', () => {
    const headers = { 'x-forwarded-for': '1.1.1.1' }
    expect(resolve(trust, '198.51.100.9', headers)).toBe('198.51.100.9')
    expect(resolve(trust, '198.51.100.9', { 'cf-connecting-ip': 'nope' })).toBe('198.51.100.9')
  })
})
