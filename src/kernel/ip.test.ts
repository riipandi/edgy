import { describe, expect, it } from '@effect/vitest'
import { formatIp, inRange, parseIp, parseRange } from './ip.ts'

const text = (input: string): string | undefined => {
  const bytes = parseIp(input)
  return bytes === undefined ? undefined : formatIp(bytes)
}

describe('parseIp', () => {
  it('reads IPv4, with or without a port', () => {
    expect(text('203.0.113.7')).toBe('203.0.113.7')
    expect(text(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(text('203.0.113.7:51234')).toBe('203.0.113.7')
  })

  it('reads IPv6 in every spelling, bracketed or not', () => {
    expect(text('::1')).toBe('0:0:0:0:0:0:0:1')
    expect(text('2001:db8::8a2e:370:7334')).toBe('2001:db8:0:0:0:8a2e:370:7334')
    expect(text('[2001:db8::1]:8080')).toBe('2001:db8:0:0:0:0:0:1')
    expect(text('fe80::1%eth0')).toBe('fe80:0:0:0:0:0:0:1')
    expect(text('2001:DB8:0:0:0:0:0:1')).toBe('2001:db8:0:0:0:0:0:1')
  })

  it('reduces an IPv4-mapped IPv6 address to IPv4', () => {
    expect(text('::ffff:10.0.0.1')).toBe('10.0.0.1')
    expect(text('::ffff:a00:1')).toBe('10.0.0.1')
  })

  it('refuses what is not an address', () => {
    for (const bad of [
      '',
      'unknown',
      '1.2.3',
      '256.1.1.1',
      '1.2.3.4.5',
      '::g',
      '1::2::3',
      ':::',
      '[::1',
      '12345::1'
    ]) {
      expect(text(bad)).toBeUndefined()
    }
  })
})

describe('parseRange and inRange', () => {
  const inside = (range: string, ip: string) => {
    const parsed = parseRange(range)
    const bytes = parseIp(ip)
    if (parsed === undefined || bytes === undefined) throw new Error(`bad input ${range} ${ip}`)
    return inRange(bytes, parsed)
  }

  it('treats a bare address as a range of one', () => {
    expect(inside('10.0.0.10', '10.0.0.10')).toBe(true)
    expect(inside('10.0.0.10', '10.0.0.11')).toBe(false)
  })

  it('matches by prefix, on and off byte boundaries', () => {
    expect(inside('172.18.0.0/16', '172.18.200.3')).toBe(true)
    expect(inside('172.18.0.0/16', '172.19.0.1')).toBe(false)
    expect(inside('10.0.0.0/22', '10.0.3.255')).toBe(true)
    expect(inside('10.0.0.0/22', '10.0.4.0')).toBe(false)
    expect(inside('0.0.0.0/0', '198.51.100.1')).toBe(true)
    expect(inside('fd00::/8', 'fd12:3456::1')).toBe(true)
    expect(inside('fd00::/8', 'fe80::1')).toBe(false)
  })

  it('matches an IPv4-mapped address against an IPv4 range', () => {
    expect(inside('10.0.0.0/8', '::ffff:10.1.2.3')).toBe(true)
  })

  it('never matches across families', () => {
    expect(inside('10.0.0.0/8', 'fd00::1')).toBe(false)
    expect(inside('::/0', '10.0.0.1')).toBe(false)
  })

  it('refuses an invalid range', () => {
    for (const bad of [
      '10.0.0.0/33',
      '::/129',
      '10.0.0.0/',
      '10.0.0.0/8/8',
      'host',
      '10.0.0.0/x'
    ]) {
      expect(parseRange(bad)).toBeUndefined()
    }
  })
})
