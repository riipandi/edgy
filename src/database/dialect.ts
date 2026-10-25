import { connect } from '@tursodatabase/database'
import type { Database as TursoDatabase } from '@tursodatabase/database'
import type { DatabaseOpts } from '@tursodatabase/database-common'
import { Session } from '@tursodatabase/serverless'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DatabaseConnection, Dialect, Driver, LogEvent } from 'kysely'
import type { CompiledQuery, QueryResult, TransactionSettings } from 'kysely'
import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { DB } from '#/database/schema.ts'
import type { DatabaseTarget } from '#/kernel/config/database.ts'

/** One bound for a remote statement; the local engine's busy timeout is the same. */
const REMOTE_QUERY_TIMEOUT_MS = 5_000

/**
 * The statement surface both transports expose. The local engine and the
 * HTTP client differ in how they are opened and how a transaction is held, not
 * in what a compiled Kysely query needs from them.
 */
interface TursoExecutor {
  execute(sql: string, parameters: readonly unknown[]): Promise<QueryResult<unknown>>
  begin(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): Promise<void>
}

/** The statement opens with INSERT; anything else cannot have created a row. */
const isInsert = (sql: string): boolean => /^\s*insert\b/i.test(sql)

const localExecutor = (database: TursoDatabase): TursoExecutor => ({
  execute: async (sql, parameters) => {
    const statement = await database.prepare(sql)
    if (statement.reader) return { rows: await statement.all(parameters) }
    const { changes, lastInsertRowid } = await statement.run(parameters)
    return {
      rows: [],
      numAffectedRows: BigInt(changes),
      // SQLite keeps the connection's previous rowid, so an UPDATE would report
      // the id of some earlier insert. The field only means something for the
      // statement that created the row.
      ...(isInsert(sql) ? { insertId: BigInt(lastInsertRowid) } : {})
    }
  },
  begin: () => database.exec('begin'),
  commit: () => database.exec('commit'),
  rollback: () => database.exec('rollback'),
  close: () => database.close()
})

const remoteExecutor = (url: string, token: string): TursoExecutor => {
  // A `Session` is one server stream: statements and transaction control go
  // through it in order. The `/compat` client wraps the same session but drops
  // `defaultQueryTimeout` and the per-call options on its way in, so a remote
  // query there could never be bounded — this is the layer that honors it.
  const session = new Session({
    url,
    authToken: token,
    defaultQueryTimeout: REMOTE_QUERY_TIMEOUT_MS
  })

  return {
    execute: async (sql, parameters) => {
      const result = await session.execute(sql, parameters as unknown[])
      // The session hands back arrays that also carry the column names as
      // non-enumerable properties. Kysely and every caller expect plain row
      // objects — a row that JSON-serializes as `[7,"seven"]` would leak the
      // transport into every API response — so the columns are mapped here.
      const rows = result.rows.map((row: unknown[]) =>
        Object.fromEntries(
          result.columns.map((column: string, index: number) => [column, row[index]])
        )
      )
      return {
        rows,
        // The session reports the rowid as a number; Kysely's result type wants
        // a bigint, and a number silently loses precision past 2^53. Only an
        // insert has one to report — the field means the row the statement
        // created, not the connection's last rowid.
        ...(isInsert(sql) && result.lastInsertRowid !== undefined
          ? { insertId: BigInt(result.lastInsertRowid) }
          : {}),
        numAffectedRows: BigInt(result.rowsAffected)
      }
    },
    begin: () => session.sequence('BEGIN'),
    // A failed COMMIT or ROLLBACK leaves the stream in an unknown state, but the
    // next statement opens a fresh one: the session drops its baton when a
    // request fails, so one network blip cannot end database access.
    commit: () => session.sequence('COMMIT'),
    rollback: () =>
      session.sequence('ROLLBACK').catch(() => {
        // The session may already have rolled back; the original failure is
        // the one the caller must see.
      }),
    close: () => session.close()
  }
}

/** Options every local connection uses; exported so the multi-process test can match them. */
export const LOCAL_CONNECT_OPTIONS = {
  timeout: 5_000,
  experimental: ['multiprocess_wal']
} satisfies DatabaseOpts

const openLocal = async (path: string): Promise<TursoExecutor> => {
  // The resolver strips the scheme before this point; a `file:` string reaching
  // here would silently create a directory named `file:`.
  if (path.startsWith('file:'))
    throw new Error(`openTursoDatabase expects a path, got the URI '${path}'`)
  const location = resolve(path)
  const directory = dirname(location)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
    chmodSync(directory, 0o775)
  }
  // The engine's busy timeout defaults to 0: a concurrent writer gets
  // "database is locked" immediately instead of waiting out the lock.
  // `multiprocess_wal` is what lets a second process open the file at all — the
  // default takes an exclusive lock for the lifetime of the connection, which
  // breaks the healthcheck probe and any migration run while the server holds
  // the database. Every process of this application passes it, so the mode
  // agrees; a plain `sqlite3` shell opening the file would not.
  const database = await connect(location, LOCAL_CONNECT_OPTIONS)
  // The file is created with the process umask (0644), so on a shared host any
  // local user could read the whole database. Narrow it to the owner, and to
  // every sidecar the engine writes beside it — this engine names its
  // shared-memory file `<db>-tshm`, not `-shm` — because those hold the
  // uncommitted rows. Matching the basename prefix rather than a suffix list
  // keeps a future rename from reopening the gap.
  chmodSync(location, 0o600)
  await database.exec('pragma foreign_keys = on')
  await database.exec('pragma journal_mode = wal')
  const base = basename(location)
  for (const name of readdirSync(directory)) {
    if (name.startsWith(`${base}-`)) chmodSync(join(directory, name), 0o600)
  }
  return localExecutor(database)
}

const openExecutor = async (target: DatabaseTarget): Promise<TursoExecutor> => {
  if (target.kind === 'local') return openLocal(target.path)
  const executor = remoteExecutor(target.url, target.token)
  // Verify the transport while the layer is still being built: a wrong host, a
  // revoked token, or an endpoint behind a broken proxy must fail here rather
  // than on the first request, which is the promise the local branch keeps by
  // opening the file. Bounded by the same query timeout as any other statement.
  try {
    await executor.execute('select 1', [])
  } catch (error) {
    await executor.close().catch(() => undefined)
    throw error
  }
  return executor
}

class TursoConnection implements DatabaseConnection {
  readonly #executor: TursoExecutor

  constructor(executor: TursoExecutor) {
    this.#executor = executor
  }

  executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    return this.#executor.execute(compiled.sql, compiled.parameters) as Promise<QueryResult<R>>
  }

  // Both transports buffer: the HTTP client has no cursor API, and keeping the
  // two paths identical matters more than a cursor neither caller uses.
  async *streamQuery<R>(
    compiled: CompiledQuery,
    chunkSize: number
  ): AsyncIterableIterator<QueryResult<R>> {
    const { rows } = (await this.#executor.execute(
      compiled.sql,
      compiled.parameters
    )) as QueryResult<R>
    // Kysely forwards the caller's number verbatim, and a step of zero never
    // advances: the loop would yield empty chunks forever without ever awaiting,
    // pinning a core and starving every timer in the process.
    const size = Math.max(1, Math.trunc(chunkSize))
    for (let index = 0; index < rows.length; index += size) {
      yield { rows: rows.slice(index, index + size) }
    }
  }

  beginTransaction(): Promise<void> {
    return this.#executor.begin()
  }

  commitTransaction(): Promise<void> {
    return this.#executor.commit()
  }

  rollbackTransaction(): Promise<void> {
    return this.#executor.rollback()
  }
}

/**
 * Kysely over Turso. `SqliteAdapter` reports `supportsMultipleConnections =
 * false`, so Kysely serializes every acquire/release pair — and a transaction
 * holds its connection for the whole `BEGIN … COMMIT` window.
 */
class TursoDriver implements Driver {
  readonly #open: () => Promise<TursoExecutor>
  #executor: TursoExecutor | undefined
  #connection: TursoConnection | undefined

  constructor(open: () => Promise<TursoExecutor>) {
    this.#open = open
  }

  async init(): Promise<void> {
    this.#executor = await this.#open()
    this.#connection = new TursoConnection(this.#executor)
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (this.#connection === undefined) throw new Error('turso driver is not initialized')
    return this.#connection
  }

  async beginTransaction(
    connection: DatabaseConnection,
    _settings: TransactionSettings
  ): Promise<void> {
    await (connection as TursoConnection).beginTransaction()
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as TursoConnection).commitTransaction()
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as TursoConnection).rollbackTransaction()
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {
    await this.#executor?.close()
    this.#executor = undefined
    this.#connection = undefined
  }
}

interface TursoDialectConfig {
  readonly open: () => Promise<TursoExecutor>
}

class TursoDialect implements Dialect {
  readonly #config: TursoDialectConfig

  constructor(config: TursoDialectConfig) {
    this.#config = config
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new TursoDriver(this.#config.open)
  }

  createIntrospector(db: Kysely<DB>): SqliteIntrospector {
    return new SqliteIntrospector(db)
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler()
  }
}

export const openTursoDatabase = async (
  target: DatabaseTarget,
  log?: (event: LogEvent) => void
): Promise<Kysely<DB>> => {
  // Open eagerly: a missing directory, an unwritable file, or an unreachable
  // remote database must fail the layer that acquires the database, not the
  // first request.
  const executor = await openExecutor(target)
  return new Kysely<DB>({
    dialect: new TursoDialect({ open: async () => executor }),
    ...(log === undefined ? {} : { log })
  })
}
