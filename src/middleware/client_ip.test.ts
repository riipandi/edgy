import { describe, expect, it } from '@effect/vitest'
import { parseRange, type TrustedProxies } from '../kernel/ip.ts'
import { clientAddress, clientLocation, type ClientIpTrust } from './client_ip.ts'

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
  const trust: ClientIpTrust = { proxies: list('10.0.0.0/8'), platformHeader: 'cf-connecting-ip' }

  it('reads it as sent where there is no socket (a Worker)', () => {
    const open: ClientIpTrust = { proxies: { kind: 'none' }, platformHeader: 'cf-connecting-ip' }
    expect(resolve(open, undefined, { 'cf-connecting-ip': '203.0.113.5' })).toBe('203.0.113.5')
    expect(resolve(open, undefined, { 'cf-connecting-ip': '2001:db8::1' })).toBe(
      '2001:db8:0:0:0:0:0:1'
    )
  })

  it('reads it from a trusted proxy, and ignores it from anyone else', () => {
    const headers = { 'cf-connecting-ip': '203.0.113.5' }
    expect(resolve(trust, '10.0.0.7', headers)).toBe('203.0.113.5')
    expect(resolve(trust, '198.51.100.9', headers)).toBe('198.51.100.9')
    const none: ClientIpTrust = { proxies: { kind: 'none' }, platformHeader: 'cf-connecting-ip' }
    expect(resolve(none, '198.51.100.9', headers)).toBe('198.51.100.9')
  })

  it('prefers it to X-Forwarded-For, which it replaces', () => {
    expect(
      resolve(trust, '10.0.0.1', {
        'cf-connecting-ip': '203.0.113.5',
        'x-forwarded-for': '1.1.1.1'
      })
    ).toBe('203.0.113.5')
  })

  it('falls back to the socket, not X-Forwarded-For, when the header is missing or malformed', () => {
    const headers = { 'x-forwarded-for': '1.1.1.1' }
    expect(resolve(trust, '10.0.0.1', headers)).toBe('10.0.0.1')
    expect(resolve(trust, '10.0.0.1', { 'cf-connecting-ip': 'nope' })).toBe('10.0.0.1')
  })
})

describe('clientLocation', () => {
  const on = {
    enabled: true,
    platformHeader: 'cf-connecting-ip',
    proxies: list('10.0.0.0/8')
  }
  const request = (init: Record<string, string>, socket: string | undefined = '10.0.0.1') => ({
    socket,
    headers: new Headers(init)
  })

  it('reads country and city from a request that came through the platform', () => {
    expect(
      clientLocation(
        request({
          'cf-connecting-ip': '203.0.113.7',
          'cf-ipcountry': 'id',
          'cf-ipcity': 'Jakarta'
        }),
        on
      )
    ).toEqual({ country: 'ID', city: 'Jakarta' })
  })

  it('believes a Worker request (no socket) as well', () => {
    expect(
      clientLocation(
        request({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'ID' }, undefined),
        on
      )
    ).toEqual({ country: 'ID' })
  })

  it('believes nothing without the platform header, so a forged one is not enough', () => {
    expect(
      clientLocation(request({ 'cf-ipcountry': 'ID', 'cf-ipcity': 'Jakarta' }), on)
    ).toBeUndefined()
    expect(
      clientLocation(request({ 'cf-connecting-ip': 'garbage', 'cf-ipcountry': 'ID' }), on)
    ).toBeUndefined()
  })

  it('believes nothing from a peer that is not a trusted proxy', () => {
    const forged = request(
      { 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'ID' },
      '198.51.100.9'
    )
    expect(clientLocation(forged, on)).toBeUndefined()
  })

  it('is off unless switched on and a platform is named', () => {
    const sent = request({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'ID' })
    expect(clientLocation(sent, { ...on, enabled: false })).toBeUndefined()
    expect(clientLocation(sent, { ...on, platformHeader: undefined })).toBeUndefined()
  })

  it('drops an unknown country and sanitises what it keeps', () => {
    const sent = request({
      'cf-connecting-ip': '203.0.113.7',
      'cf-ipcountry': 'XX',
      'cf-ipcity': `Bad\u0007City${'x'.repeat(100)}`
    })
    const location = clientLocation(sent, on)
    expect(location?.country).toBeUndefined()
    expect(location?.city).toHaveLength(64)
    expect(location?.city).not.toContain('\u0007')
    expect(
      clientLocation(request({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'ZZZ' }), on)
    ).toBeUndefined()
  })
})

describe('an empty entry in X-Forwarded-For', () => {
  const trust: ClientIpTrust = { proxies: list('10.0.0.0/8'), platformHeader: undefined }

  it.each(['1.2.3.4,,10.0.0.2', '1.2.3.4, ,10.0.0.2', '1.2.3.4,10.0.0.2,', ',1.2.3.4,10.0.0.2'])(
    'is skipped: %j still finds the client',
    (header) => {
      expect(resolve(trust, '10.0.0.1', { 'x-forwarded-for': header })).toBe('1.2.3.4')
    }
  )

  it('leaves a header of nothing else to the socket address', () => {
    expect(resolve(trust, '10.0.0.1', { 'x-forwarded-for': ',,' })).toBe('10.0.0.1')
  })

  it('still stops at an entry that is not an address', () => {
    expect(resolve(trust, '10.0.0.1', { 'x-forwarded-for': 'garbage,10.0.0.2' })).toBe('10.0.0.1')
  })
})

describe('a range of one family', () => {
  it('does not match the other: ::/0 trusts no IPv4 peer', () => {
    const trust: ClientIpTrust = { proxies: list('::/0'), platformHeader: undefined }
    expect(resolve(trust, '10.0.0.1', { 'x-forwarded-for': '1.2.3.4' })).toBe('10.0.0.1')
    expect(resolve(trust, '2001:db8::1', { 'x-forwarded-for': '1.2.3.4' })).toBe('1.2.3.4')
  })
})
