import { it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import { BlockList } from 'node:net'
import { expect } from 'vite-plus/test'
import type { TrustProxy } from '#/kernel/config/security.ts'
import { resolveClientIp } from './trust-proxy.ts'

const trustNone: TrustProxy = { trustAll: false, proxies: new BlockList() }

const trustList = (
  entries: ReadonlyArray<[address: string, bits: number | undefined]>
): TrustProxy => {
  const proxies = new BlockList()
  for (const [address, bits] of entries) {
    if (bits === undefined) proxies.addAddress(address, address.includes(':') ? 'ipv6' : 'ipv4')
    else proxies.addSubnet(address, bits, address.includes(':') ? 'ipv6' : 'ipv4')
  }
  return { trustAll: false, proxies }
}

const trustAll: TrustProxy = { trustAll: true, proxies: new BlockList() }

const requestWith = (peer: string | undefined, headers: Record<string, string>) => {
  const request = HttpServerRequest.fromWeb(new Request('http://test/api/health', { headers }))
  return request.modify({
    remoteAddress: peer === undefined ? Option.none() : Option.some(peer)
  })
}

const resolvedIp = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrUndefined(request.remoteAddress)

it.effect('ignores spoofed headers from an untrusted peer', () =>
  Effect.sync(() => {
    const request = requestWith('10.0.0.1', { 'x-forwarded-for': '203.0.113.7' })
    expect(resolvedIp(resolveClientIp(request, trustNone))).toBe('10.0.0.1')
    expect(resolvedIp(resolveClientIp(request, trustList([['10.0.0.2', undefined]])))).toBe(
      '10.0.0.1'
    )
  })
)

it.effect('honors the rightmost untrusted entry behind a trusted proxy', () =>
  Effect.sync(() => {
    const trust = trustList([
      ['10.0.0.1', undefined],
      ['172.18.0.0', 16]
    ])
    // Direct peer trusted by exact IP; the proxy forwarded a spoofable chain.
    const chained = requestWith('10.0.0.1', { 'x-forwarded-for': '203.0.113.7, 172.18.0.9' })
    expect(resolvedIp(resolveClientIp(chained, trust))).toBe('203.0.113.7')
    // Direct peer trusted by CIDR.
    const byCidr = requestWith('172.18.3.9', { 'x-forwarded-for': '203.0.113.7' })
    expect(resolvedIp(resolveClientIp(byCidr, trust))).toBe('203.0.113.7')
  })
)

it.effect('keeps the peer address when the chain is fully trusted or absent', () =>
  Effect.sync(() => {
    // Every X-Forwarded-For entry is a trusted proxy: the chain's leftmost
    // entry is the client.
    const fullyTrusted = requestWith('10.0.0.1', { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' })
    expect(resolvedIp(resolveClientIp(fullyTrusted, trustList([['10.0.0.0', 8]])))).toBe('10.0.0.1')
    // A trusted proxy that sends no headers is the client itself.
    const bare = requestWith('10.0.0.1', {})
    expect(resolvedIp(resolveClientIp(bare, trustList([['10.0.0.1', undefined]])))).toBe('10.0.0.1')
  })
)

it.effect('trusts every address only in trust-all mode', () =>
  Effect.sync(() => {
    const chained = requestWith('10.0.0.1', { 'x-forwarded-for': '203.0.113.7, 10.0.0.2' })
    expect(resolvedIp(resolveClientIp(chained, trustAll))).toBe('203.0.113.7')
    expect(resolvedIp(resolveClientIp(chained, trustNone))).toBe('10.0.0.1')
  })
)

it.effect('falls back to X-Real-IP and handles a missing peer', () =>
  Effect.sync(() => {
    const trust = trustList([['10.0.0.1', undefined]])
    const byRealIp = requestWith('10.0.0.1', { 'x-real-ip': '203.0.113.7' })
    expect(resolvedIp(resolveClientIp(byRealIp, trust))).toBe('203.0.113.7')
    // No direct peer address (web handler tests): nothing to trust.
    const peerless = requestWith(undefined, { 'x-forwarded-for': '203.0.113.7' })
    expect(resolvedIp(resolveClientIp(peerless, trustAll))).toBeUndefined()
  })
)
