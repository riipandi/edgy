import { connect } from '@tursodatabase/database'
import type { Database as TursoDatabase } from '@tursodatabase/database'
import { createClient } from '@tursodatabase/serverless/compat'
import type { InValue, Transaction } from '@tursodatabase/serverless/compat'
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DatabaseConnection, Dialect, Driver, LogEvent } from 'kysely'
import type { CompiledQuery, QueryResult, TransactionSettings } from 'kysely'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { DB } from '#/database/schema.ts'
import type { DatabaseTarget } from '#/kernel/config/database.ts'

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

const localExecutor = (database: TursoDatabase): TursoExecutor => ({
  execute: async (sql, parameters) => {
    const statement = await database.prepare(sql)
    if (statement.reader) return { rows: await statement.all(parameters) }
    const { changes, lastInsertRowid } = await statement.run(parameters)
    return {
      rows: [],
      numAffectedRows: BigInt(changes),
      insertId: BigInt(lastInsertRowid)
    }
  },
  begin: () => database.exec('begin'),
  commit: () => database.exec('commit'),
  rollback: () => database.exec('rollback'),
  close: () => database.close()
})

const remoteExecutor = (url: string, token: string): TursoExecutor => {
  const client = createClient({ url, authToken: token })
  // A transaction owns a dedicated session until it commits, so every
  // statement inside the window must go through the handle.
  let transaction: Transaction | undefined

  return {
    execute: async (sql, parameters) => {
      const target = transaction ?? client
      const result = await target.execute({ sql, args: parameters as InValue[] })
      // The client hands back arrays that also carry the column names as
      // non-enumerable properties. Kysely and every caller expect plain row
      // objects — a row that JSON-serializes as `[7,"seven"]` would leak the
      // transport into every API response — so the columns are mapped here.
      const rows = result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))
      )
      return {
        rows,
        ...(result.lastInsertRowid === undefined ? {} : { insertId: result.lastInsertRowid }),
        numAffectedRows: BigInt(result.rowsAffected)
      }
    },
    begin: async () => {
      transaction = await client.transaction()
    },
    // The client closes the session before it rethrows a failed COMMIT, so the
    // slot must be empty before the await: a handle left behind is a closed one,
    // and every later statement would fail with "Transaction is closed" — one
    // network blip ending all database access for the process.
    commit: async () => {
      const current = transaction
      transaction = undefined
      await current?.commit()
    },
    rollback: async () => {
      const current = transaction
      transaction = undefined
      // The session may already be closed by a failed COMMIT; swallowing that
      // keeps the original failure the one the caller sees.
      await current?.rollback().catch(() => undefined)
    },
    close: async () => {
      client.close()
    }
  }
}

/** Options every local connection uses; exported so the multi-process test can match them. */
export const LOCAL_CONNECT_OPTIONS = {
  timeout: 5_000,
  experimental: ['multiprocess_wal' as const]
}

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
  // the sidecars, which the engine creates with the same umask and which hold
  // the uncommitted rows.
  chmodSync(location, 0o600)
  await database.exec('pragma foreign_keys = on')
  await database.exec('pragma journal_mode = wal')
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${location}${suffix}`)) chmodSync(`${location}${suffix}`, 0o600)
  }
  return localExecutor(database)
}

const openExecutor = async (target: DatabaseTarget): Promise<TursoExecutor> =>
  target.kind === 'remote' ? remoteExecutor(target.url, target.token) : openLocal(target.path)

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
    for (let index = 0; index < rows.length; index += chunkSize) {
      yield { rows: rows.slice(index, index + chunkSize) }
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
  // Open eagerly: a missing directory, an unwritable file, or a rejected remote
  // URL must fail the layer that acquires the database, not the first request.
  const executor = await openExecutor(target)
  return new Kysely<DB>({
    dialect: new TursoDialect({ open: async () => executor }),
    ...(log === undefined ? {} : { log })
  })
}
