import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import {
  isTrustedProxy,
  redisDatabases,
  redisUrlFor,
  redisUrlForDatabase,
  telemetryEnabled
} from './helpers.ts'
import { parseTrustProxy } from './validators.ts'

describe('redisUrlFor', () => {
  it('sets the database index on the path', () => {
    expect(redisUrlFor('redis://localhost:6379', 1)).toBe('redis://localhost:6379/1')
  })

  it('keeps credentials, host, and port', () => {
    expect(redisUrlFor('redis://user:pass@cache.internal:6380', 2)).toBe(
      'redis://user:pass@cache.internal:6380/2'
    )
  })

  it('replaces an index already present in the URL', () => {
    expect(redisUrlFor('redis://localhost:6379/9', 1)).toBe('redis://localhost:6379/1')
  })

  it('keeps the rediss scheme', () => {
    expect(redisUrlFor('rediss://secure.example.com', 1)).toBe('rediss://secure.example.com/1')
  })
})

describe('redis databases', () => {
  it('gives each consumer its own index', () => {
    expect(redisDatabases.cache).not.toBe(redisDatabases.rateLimit)
    expect(redisUrlForDatabase('redis://localhost:6379', 'cache')).toBe('redis://localhost:6379/1')
    expect(redisUrlForDatabase('redis://localhost:6379', 'rateLimit')).toBe(
      'redis://localhost:6379/2'
    )
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

describe('telemetryEnabled', () => {
  it('returns true when sdk is not disabled and endpoint is set', () => {
    expect(telemetryEnabled({ sdkDisabled: false, endpoint: 'http://localhost:4318' })).toBe(true)
  })

  it('returns false when sdk is disabled', () => {
    expect(telemetryEnabled({ sdkDisabled: true, endpoint: 'http://localhost:4318' })).toBe(false)
  })

  it('returns false when endpoint is empty', () => {
    expect(telemetryEnabled({ sdkDisabled: false, endpoint: '' })).toBe(false)
  })
})
