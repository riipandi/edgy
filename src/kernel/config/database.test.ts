import { ConfigProvider, Effect, Logger, Redacted } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { databaseConfig, resolveDatabaseTarget, type DatabaseTarget } from './database.ts'

const resolve = (url: string, token = ''): Promise<DatabaseTarget> =>
  Effect.runPromise(resolveDatabaseTarget(url, Redacted.make(token)))

const local = (path: string): DatabaseTarget => ({ kind: 'local', path })

describe('DATABASE_URL local forms', () => {
  it('accepts the file: forms RFC 8089 defines', async () => {
    await expect(resolve('file:/var/lib/edgy/app.db')).resolves.toEqual(
      local('/var/lib/edgy/app.db')
    )
    await expect(resolve('file:///var/lib/edgy/app.db')).resolves.toEqual(
      local('/var/lib/edgy/app.db')
    )
    await expect(resolve('file://localhost/var/lib/edgy/app.db')).resolves.toEqual(
      local('/var/lib/edgy/app.db')
    )
  })

  it('accepts a relative reference, which the engine resolves against the cwd', async () => {
    await expect(resolve('file:./storage/data/app.db')).resolves.toEqual(
      local('./storage/data/app.db')
    )
  })

  it('decodes percent-encoded paths', async () => {
    await expect(resolve('file:/var/lib/edgy/my%20app.db')).resolves.toEqual(
      local('/var/lib/edgy/my app.db')
    )
    // A stray '%' is not an escape sequence; the path is kept as written.
    await expect(resolve('file:/var/lib/100%.db')).resolves.toEqual(local('/var/lib/100%.db'))
  })

  it('accepts a bare path as the convenience form', async () => {
    await expect(resolve('storage/data/app.db')).resolves.toEqual(local('storage/data/app.db'))
    await expect(resolve('  storage/data/app.db  ')).resolves.toEqual(local('storage/data/app.db'))
  })

  it('trims the surrounding space of a file: URI', async () => {
    await expect(resolve('  file:/tmp/app.db  ')).resolves.toEqual(local('/tmp/app.db'))
  })
})

describe('DATABASE_URL refusals', () => {
  it('refuses an empty value', async () => {
    await expect(resolve('')).rejects.toThrow(/must not be empty/)
    await expect(resolve('   ')).rejects.toThrow(/must not be empty/)
  })

  it('refuses :memory:, which the driver cannot open', async () => {
    await expect(resolve(':memory:')).rejects.toThrow(/in-memory databases are not supported/)
  })

  it('refuses a file: URI naming another host', async () => {
    await expect(resolve('file://fileserver/share/app.db')).rejects.toThrow(
      /names the host 'fileserver'/
    )
  })

  it('refuses file://path, the two-slash form with no path separator', async () => {
    await expect(resolve('file://app.db')).rejects.toThrow(/has no path after the host/)
  })

  it('refuses a file: URI with no path at all', async () => {
    await expect(resolve('file:')).rejects.toThrow(/names no file path/)
    await expect(resolve('file://localhost/')).resolves.toEqual(local('/'))
  })

  it('refuses a scheme the driver cannot serve, and names the accepted ones', async () => {
    await expect(resolve('postgres://host/db', 'token')).rejects.toThrow(
      /'postgres:\/\/' is not supported; use file:path, a local path, or one of libsql:, turso:, https:, http:/
    )
    await expect(resolve('mysql://host/db', 'token')).rejects.toThrow(/is not supported/)
  })
})

describe('DATABASE_URL remote forms', () => {
  it('accepts every scheme turso db show prints, plus http', async () => {
    for (const scheme of ['libsql:', 'turso:', 'https:', 'http:']) {
      const url = `${scheme}//probe-riipandi.aws-ap-south-1.turso.io`
      await expect(resolve(url, 'a-token')).resolves.toEqual({
        kind: 'remote',
        url,
        token: 'a-token'
      })
    }
  })

  it('passes the scheme through untouched, because the client normalizes it', async () => {
    const target = await resolve('libsql://probe.turso.io', 'token')
    expect(target).toMatchObject({ url: 'libsql://probe.turso.io' })
  })

  it('requires a token', async () => {
    await expect(resolve('libsql://probe.turso.io')).rejects.toThrow(
      /DATABASE_TOKEN: is required for the remote database 'libsql:\/\/probe.turso.io'/
    )
    await expect(resolve('libsql://probe.turso.io', '   ')).rejects.toThrow(/is required/)
  })

  it('trims the token it carries', async () => {
    await expect(resolve('turso://probe.turso.io', '  secret  ')).resolves.toEqual({
      kind: 'remote',
      url: 'turso://probe.turso.io',
      token: 'secret'
    })
  })
})

describe('DATABASE_URL warnings', () => {
  const warningsFor = (url: string, token: string): Promise<ReadonlyArray<string>> => {
    const lines: Array<string> = []
    const logger = Logger.layer([
      Logger.make(({ logLevel, message }) => {
        if (logLevel === 'Warn') lines.push(String(message))
      })
    ])
    return Effect.runPromise(
      databaseConfig.config.pipe(
        Effect.asVoid,
        Effect.provide(logger),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnvRecord({ DATABASE_URL: url, DATABASE_TOKEN: token })
          )
        )
      )
    ).then(() => lines)
  }

  it('warns when the token would travel over plain http', async () => {
    const warnings = await warningsFor('http://probe.turso.io', 'a-token')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('DATABASE_TOKEN travels unencrypted')
  })

  it('stays silent for every encrypted remote scheme', async () => {
    for (const scheme of ['libsql://', 'turso://', 'https://'])
      expect(await warningsFor(`${scheme}probe.turso.io`, 'a-token')).toEqual([])
  })

  it('warns that a token is ignored next to a local database', async () => {
    const warnings = await warningsFor('file:/tmp/ignored-token.db', 'a-token')
    expect(warnings).toEqual(['DATABASE_TOKEN is ignored: DATABASE_URL points at a local database'])
  })
})
