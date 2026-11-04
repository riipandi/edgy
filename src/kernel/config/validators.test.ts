import { Effect, Redacted } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { parseBaseUrl, parseOriginList, parseTrustProxy } from './validators.ts'
import { parseRedisUrl, resolveDatabaseTarget } from './validators.ts'
import type { DatabaseTarget } from './validators.ts'

const resolveBaseUrl = (value: string) => Effect.runPromise(parseBaseUrl(value))

const resolveDbTarget = (url: string, token = ''): Promise<DatabaseTarget> =>
  Effect.runPromise(resolveDatabaseTarget(url, Redacted.make(token)))

const localDb = (path: string): DatabaseTarget => ({ kind: 'local', path })

describe('parseBaseUrl', () => {
  it('keeps the origin and drops a trailing path', async () => {
    await expect(resolveBaseUrl('https://edgy.example.com')).resolves.toBe(
      'https://edgy.example.com'
    )
    await expect(resolveBaseUrl('https://edgy.example.com/some/path')).resolves.toBe(
      'https://edgy.example.com'
    )
  })

  it('keeps a non-default port and trims surrounding space', async () => {
    await expect(resolveBaseUrl('  http://localhost:8080  ')).resolves.toBe('http://localhost:8080')
  })

  it('rejects a relative or non-http value', async () => {
    await expect(resolveBaseUrl('/relative')).rejects.toThrow(/not an absolute URL/)
    await expect(resolveBaseUrl('ftp://example.com')).rejects.toThrow(/must use http or https/)
  })

  it('rejects an empty value', async () => {
    await expect(resolveBaseUrl('')).rejects.toThrow(/absolute http\(s\) URL/)
    await expect(resolveBaseUrl('   ')).rejects.toThrow(/absolute http\(s\) URL/)
  })
})

describe('resolveDatabaseTarget local forms', () => {
  it('accepts the file: forms RFC 8089 defines', async () => {
    await expect(resolveDbTarget('file:/var/lib/edgy/app.db')).resolves.toEqual(
      localDb('/var/lib/edgy/app.db')
    )
    await expect(resolveDbTarget('file:///var/lib/edgy/app.db')).resolves.toEqual(
      localDb('/var/lib/edgy/app.db')
    )
    await expect(resolveDbTarget('file://localhost/var/lib/edgy/app.db')).resolves.toEqual(
      localDb('/var/lib/edgy/app.db')
    )
  })

  it('accepts a relative reference, which the engine resolves against the cwd', async () => {
    await expect(resolveDbTarget('file:./storage/data/app.db')).resolves.toEqual(
      localDb('./storage/data/app.db')
    )
  })

  it('decodes percent-encoded paths', async () => {
    await expect(resolveDbTarget('file:/var/lib/edgy/my%20app.db')).resolves.toEqual(
      localDb('/var/lib/edgy/my app.db')
    )
    await expect(resolveDbTarget('file:/var/lib/100%.db')).resolves.toEqual(
      localDb('/var/lib/100%.db')
    )
  })

  it('accepts a bare path as the convenience form', async () => {
    await expect(resolveDbTarget('storage/data/app.db')).resolves.toEqual(
      localDb('storage/data/app.db')
    )
    await expect(resolveDbTarget('  storage/data/app.db  ')).resolves.toEqual(
      localDb('storage/data/app.db')
    )
  })

  it('trims the surrounding space of a file: URI', async () => {
    await expect(resolveDbTarget('  file:/tmp/app.db  ')).resolves.toEqual(localDb('/tmp/app.db'))
  })
})

describe('resolveDatabaseTarget refusals', () => {
  it('refuses an empty value', async () => {
    await expect(resolveDbTarget('')).rejects.toThrow(/must not be empty/)
    await expect(resolveDbTarget('   ')).rejects.toThrow(/must not be empty/)
  })

  it('refuses :memory:, which the driver cannot open', async () => {
    await expect(resolveDbTarget(':memory:')).rejects.toThrow(
      /in-memory databases are not supported/
    )
  })

  it('refuses a file: URI naming another host', async () => {
    await expect(resolveDbTarget('file://fileserver/share/app.db')).rejects.toThrow(
      /names the host 'fileserver'/
    )
  })

  it('refuses file://path, the two-slash form with no path separator', async () => {
    await expect(resolveDbTarget('file://app.db')).rejects.toThrow(/has no path after the host/)
  })

  it('refuses a file: URI with no path at all', async () => {
    await expect(resolveDbTarget('file:')).rejects.toThrow(/names no file path/)
    await expect(resolveDbTarget('file://localhost/')).resolves.toEqual(localDb('/'))
  })

  it('refuses a scheme the driver cannot serve, and names the accepted ones', async () => {
    await expect(resolveDbTarget('postgres://host/db', 'token')).rejects.toThrow(
      /'postgres:\/\/' is not supported; use file:path, a local path, or one of libsql:, turso:, https:, http:/
    )
    await expect(resolveDbTarget('mysql://host/db', 'token')).rejects.toThrow(/is not supported/)
  })
})

describe('resolveDatabaseTarget remote forms', () => {
  it('accepts every scheme turso db show prints, plus http', async () => {
    for (const scheme of ['libsql:', 'turso:', 'https:', 'http:']) {
      const url = `${scheme}//probe-riipandi.aws-ap-south-1.turso.io`
      await expect(resolveDbTarget(url, 'a-token')).resolves.toEqual({
        kind: 'remote',
        url,
        token: 'a-token'
      })
    }
  })

  it('passes the scheme through untouched, because the client normalizes it', async () => {
    const target = await resolveDbTarget('libsql://probe.turso.io', 'token')
    expect(target).toMatchObject({ url: 'libsql://probe.turso.io' })
  })

  it('requires a token', async () => {
    await expect(resolveDbTarget('libsql://probe.turso.io')).rejects.toThrow(
      /DATABASE_TOKEN: is required for the remote database 'libsql:\/\/probe.turso.io'/
    )
    await expect(resolveDbTarget('libsql://probe.turso.io', '   ')).rejects.toThrow(/is required/)
  })

  it('trims the token it carries', async () => {
    await expect(resolveDbTarget('turso://probe.turso.io', '  secret  ')).resolves.toEqual({
      kind: 'remote',
      url: 'turso://probe.turso.io',
      token: 'secret'
    })
  })
})

describe('parseRedisUrl', () => {
  it('accepts redis:// and rediss:// URLs', async () => {
    await expect(Effect.runPromise(parseRedisUrl('redis://localhost:6379'))).resolves.toBe(
      'redis://localhost:6379'
    )
    await expect(
      Effect.runPromise(parseRedisUrl('rediss://secure.example.com:6380'))
    ).resolves.toBe('rediss://secure.example.com:6380')
  })

  it('rejects a non-redis URL', async () => {
    await expect(Effect.runPromise(parseRedisUrl('http://localhost'))).rejects.toThrow(/redis:\/\//)
  })
})

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

describe('parseOriginList', () => {
  it('parses comma-separated origins', async () => {
    const origins = await Effect.runPromise(
      parseOriginList(' https://a.example.com , https://b.example.com ')
    )
    expect(origins).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('returns an empty array for empty string', async () => {
    const origins = await Effect.runPromise(parseOriginList(''))
    expect(origins).toEqual([])
  })

  it('rejects malformed origins', async () => {
    await expect(Effect.runPromise(parseOriginList('notaurl'))).rejects.toThrow(
      /is not an absolute origin URL/
    )
  })
})
