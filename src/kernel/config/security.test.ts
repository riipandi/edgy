import { Config, ConfigProvider, Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { isTrustedProxy, parseTrustProxy, securityConfig } from './security.ts'

const resolved = <A>(config: Config.Config<A>, env: Record<string, string>) =>
  Effect.runPromise(
    config.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))))
  )

describe('parseTrustProxy', () => {
  it('treats empty and false as trusting nothing', async () => {
    const empty = await Effect.runPromise(parseTrustProxy(''))
    expect(empty.trustAll).toBe(false)
    expect(empty.proxies.check('10.0.0.1', 'ipv4')).toBe(false)
    const off = await Effect.runPromise(parseTrustProxy('false'))
    expect(off.trustAll).toBe(false)
    await expect(Effect.runPromise(parseTrustProxy('   false  '))).resolves.toMatchObject({
      trustAll: false
    })
  })

  it('treats true, case-insensitive, as trusting everything', async () => {
    await expect(Effect.runPromise(parseTrustProxy('true'))).resolves.toMatchObject({
      trustAll: true
    })
    await expect(Effect.runPromise(parseTrustProxy(' TRUE '))).resolves.toMatchObject({
      trustAll: true
    })
  })

  it('collects proxy addresses and subnets', async () => {
    const trust = await Effect.runPromise(parseTrustProxy('10.0.0.1, 192.168.0.0/24, ::1'))
    expect(trust.trustAll).toBe(false)
    expect(trust.proxies.check('10.0.0.1', 'ipv4')).toBe(true)
    expect(trust.proxies.check('10.0.0.2', 'ipv4')).toBe(false)
    expect(trust.proxies.check('192.168.0.5', 'ipv4')).toBe(true)
    expect(trust.proxies.check('192.168.1.5', 'ipv4')).toBe(false)
    expect(trust.proxies.check('::1', 'ipv6')).toBe(true)
    expect(trust.proxies.check('::2', 'ipv6')).toBe(false)
  })

  it('tolerates empty entries in the list', async () => {
    const trust = await Effect.runPromise(parseTrustProxy('10.0.0.1, '))
    expect(trust.proxies.check('10.0.0.1', 'ipv4')).toBe(true)
  })

  it('rejects entries that are not IPs or CIDR ranges', async () => {
    const outcome = await Effect.runPromiseExit(parseTrustProxy('proxy.internal'))
    expect(outcome._tag).toBe('Failure')
    if (outcome._tag === 'Failure') {
      expect(String(outcome.cause)).toContain('is not an IP or CIDR range')
    }
  })
})

describe('isTrustedProxy', () => {
  it('trusts every address when trustAll is set, and only listed ones otherwise', async () => {
    const trust = await Effect.runPromise(parseTrustProxy('10.0.0.1'))
    expect(isTrustedProxy(trust, '10.0.0.1')).toBe(true)
    expect(isTrustedProxy(trust, '10.0.0.2')).toBe(false)
    expect(isTrustedProxy(trust, 'not-an-address')).toBe(false)

    const all = await Effect.runPromise(parseTrustProxy('true'))
    expect(isTrustedProxy(all, 'anything')).toBe(true)
  })
})

describe('securityConfig', () => {
  it('parses CORS origins and rejects malformed ones', async () => {
    const config = securityConfig.config
    const origins = await resolved(config, {
      CORS_ALLOWED_ORIGINS: ' https://a.example.com , https://b.example.com '
    })
    expect(origins.corsAllowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com'])
    await expect(resolved(config, { CORS_ALLOWED_ORIGINS: 'notaurl' })).rejects.toThrow(
      /is not an absolute origin URL/
    )
    await expect(resolved(config, {})).resolves.toMatchObject({ corsAllowedOrigins: [] })
  })

  it('parses TRUST_PROXY through the composed config', async () => {
    const config = securityConfig.config
    const parsed = await resolved(config, { TRUST_PROXY: '10.0.0.1' })
    expect(parsed.trustProxy.trustAll).toBe(false)
    expect(parsed.trustProxy.proxies.check('10.0.0.1', 'ipv4')).toBe(true)
  })
})
