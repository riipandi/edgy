import { Config, Effect, Redacted } from 'effect'
import type { ConfigError } from 'effect/Config'
import { flag, group, invalid, secret, text, type Node, type ValueOf } from './field.ts'

/** A URL Kysely is pointed at: a local engine file, or a Turso database over HTTP. */
export type DatabaseTarget =
  | { readonly kind: 'local'; readonly path: string }
  | { readonly kind: 'remote'; readonly url: string; readonly token: string }

const REMOTE_SCHEMES = ['libsql:', 'turso:', 'https:', 'http:'] as const
const FILE_SCHEME = 'file:'

/**
 * A `file:` URI as RFC 8089 describes it: `file:/path` and `file:///path` reach
 * this host, `file://localhost/path` too, and `file://other/path` names another
 * machine a local engine cannot open. The path part is percent-decoded, and a
 * relative reference (`file:./data/app.db`) resolves against the working
 * directory when the engine opens it.
 */
const parseFileUrl = (raw: string): Effect.Effect<string, ConfigError> =>
  Effect.suspend((): Effect.Effect<string, ConfigError> => {
    const rest = raw.slice(FILE_SCHEME.length)
    let pathname = rest
    if (rest.startsWith('//')) {
      const authority = rest.slice(2)
      const slash = authority.indexOf('/')
      // `file://path` carries no path separator after the authority, which the
      // scheme does not allow: the authority would swallow the first segment.
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
      // A literal '%' that is not an escape sequence: keep the path as written.
    }
    // A drive-letter path arrives as /c:/… when the URI has an empty authority.
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(decoded)) decoded = decoded.slice(1)
    return Effect.succeed(decoded)
  })

/**
 * The one place a database URL becomes a transport. A scheme the driver cannot
 * serve is an error rather than a silent fallback to a local file.
 */
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
    // A bare path is the one convenience form: `file:` stays the documented
    // shape, but a path without a scheme can only mean a local file.
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

const fields = group(
  {
    url: text(
      'DATABASE_URL',
      'file:./storage/data/app.db',
      'Turso database URL: a file: URI for a local database, or a remote URL'
    ),
    token: secret('DATABASE_TOKEN', '', 'Turso auth token, required for a remote database'),
    autoMigrate: flag('DATABASE_AUTO_MIGRATE', false, 'Apply pending migrations before serving')
  },
  'Database'
)

export const databaseConfig: Node<ValueOf<typeof fields> & { readonly target: DatabaseTarget }> = {
  config: fields.config.pipe(
    Config.mapEffect((value) =>
      resolveDatabaseTarget(value.url, value.token).pipe(
        Effect.tap((target) =>
          target.kind === 'local' && Redacted.value(value.token).trim() !== ''
            ? Effect.logWarning(
                'DATABASE_TOKEN is ignored: DATABASE_URL points at a local database'
              )
            : Effect.void
        ),
        Effect.map((target) => ({ ...value, target }))
      )
    )
  ),
  specs: fields.specs
}

export type DatabaseConfig = ValueOf<typeof databaseConfig>
