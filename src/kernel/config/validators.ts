import { Config, Effect, Redacted } from 'effect'
import type { ConfigError } from 'effect/Config'
import { BlockList, isIP } from 'node:net'
import { invalid } from './field.ts'

export type DatabaseTarget =
  | { readonly kind: 'local'; readonly path: string }
  | { readonly kind: 'remote'; readonly url: string; readonly token: string }

export interface TrustProxy {
  readonly trustAll: boolean
  readonly proxies: BlockList
}

const REMOTE_SCHEMES = ['libsql:', 'turso:', 'https:', 'http:'] as const
const FILE_SCHEME = 'file:'

export const parseBaseUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim()
    if (value === '')
      return Effect.fail(invalid('APP_BASE_URL', 'must be set to an absolute http(s) URL'))
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? Effect.succeed(url.origin)
        : Effect.fail(invalid('APP_BASE_URL', `'${value}' must use http or https`))
    } catch {
      return Effect.fail(invalid('APP_BASE_URL', `'${value}' is not an absolute URL`))
    }
  })

export const parseFileUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend((): Effect.Effect<string, ConfigError> => {
    const rest = raw.slice(FILE_SCHEME.length)
    let pathname = rest
    if (rest.startsWith('//')) {
      const authority = rest.slice(2)
      const slash = authority.indexOf('/')
      if (slash < 0)
        return Effect.fail(
          invalid(
            'DATABASE_URL',
            `'${raw}' has no path after the host; write file:/path or file:///path`
          )
        )
      const host = authority.slice(0, slash)
      if (host !== '' && host.toLowerCase() !== 'localhost')
        return Effect.fail(
          invalid(
            'DATABASE_URL',
            `'${raw}' names the host '${host}'; a local database is file:/path or file:///path`
          )
        )
      pathname = authority.slice(slash)
    }
    if (pathname === '') return Effect.fail(invalid('DATABASE_URL', `'${raw}' names no file path`))

    let decoded = pathname
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      // Keep literal % that is not an escape sequence.
    }
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(decoded)) decoded = decoded.slice(1)
    return Effect.succeed(decoded)
  })

export const resolveDatabaseTarget = (
  rawUrl: string,
  token: Redacted.Redacted<string>
): Effect.Effect<DatabaseTarget, ConfigError> =>
  Effect.suspend((): Effect.Effect<DatabaseTarget, ConfigError> => {
    const url = rawUrl.trim()
    const secretValue = Redacted.value(token).trim()
    if (url === '') return Effect.fail(invalid('DATABASE_URL', 'must not be empty'))
    if (url === ':memory:')
      return Effect.fail(
        invalid(
          'DATABASE_URL',
          'in-memory databases are not supported; point DATABASE_URL at a file: URI'
        )
      )

    if (url.startsWith(FILE_SCHEME))
      return Effect.map(parseFileUrl(url), (path): DatabaseTarget => ({ kind: 'local', path }))

    const remote = url.includes('://')
    if (!remote) return Effect.succeed({ kind: 'local', path: url })

    const scheme = `${url.slice(0, url.indexOf(':') + 1)}` as (typeof REMOTE_SCHEMES)[number]
    if (!REMOTE_SCHEMES.some((candidate) => candidate === scheme))
      return Effect.fail(
        invalid(
          'DATABASE_URL',
          `'${scheme}//' is not supported; use ${FILE_SCHEME}path, a local path, or one of ${REMOTE_SCHEMES.join(', ')}`
        )
      )
    if (secretValue === '')
      return Effect.fail(invalid('DATABASE_TOKEN', `is required for the remote database '${url}'`))
    return Effect.succeed({ kind: 'remote', url, token: secretValue })
  })

export const isCleartext = (target: DatabaseTarget): boolean =>
  target.kind === 'remote' && target.url.toLowerCase().startsWith('http://')

export const parseRedisUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim()
    if (!/^rediss?:\/\//.test(value))
      return Effect.fail(invalid('REDIS_URL', `'${value}' is not a redis:// or rediss:// URL`))
    try {
      new URL(value)
      return Effect.succeed(value)
    } catch {
      return Effect.fail(invalid('REDIS_URL', `'${value}' is not a valid URL`))
    }
  })

export const family = (address: string): 'ipv4' | 'ipv6' => (isIP(address) === 6 ? 'ipv6' : 'ipv4')

export const parseOriginList = (
  raw: string
): Effect.Effect<ReadonlyArray<string>, Config.ConfigError> =>
  Effect.suspend(() => {
    const origins = raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '')
    for (const origin of origins) {
      if (!/^https?:\/\//.test(origin))
        return Effect.fail(
          invalid('CORS_ALLOWED_ORIGINS', `'${origin}' is not an absolute origin URL`)
        )
    }
    return Effect.succeed(origins)
  })

const addProxyEntry = (proxies: BlockList, entry: string): void => {
  const separator = entry.indexOf('/')
  const address = separator === -1 ? entry : entry.slice(0, separator)
  if (isIP(address) === 0) throw new Error(`'${entry}' is not an IP or CIDR range`)
  if (separator === -1) proxies.addAddress(address, family(address))
  else proxies.addSubnet(address, Number(entry.slice(separator + 1)), family(address))
}

export const parseTrustProxy = (raw: string): Effect.Effect<TrustProxy, Config.ConfigError> =>
  Effect.suspend(() => {
    const value = raw.trim().toLowerCase()
    if (value === '' || value === 'false')
      return Effect.succeed<TrustProxy>({ trustAll: false, proxies: new BlockList() })
    if (value === 'true')
      return Effect.succeed<TrustProxy>({ trustAll: true, proxies: new BlockList() })

    const proxies = new BlockList()
    const entries = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    if (entries.length === 0)
      return Effect.fail(invalid('TRUST_PROXY', 'expected proxy IPs or CIDR ranges, or true/false'))
    for (const entry of entries) {
      try {
        addProxyEntry(proxies, entry)
      } catch {
        return Effect.fail(invalid('TRUST_PROXY', `'${entry}' is not an IP or CIDR range`))
      }
    }
    return Effect.succeed<TrustProxy>({ trustAll: false, proxies })
  })
