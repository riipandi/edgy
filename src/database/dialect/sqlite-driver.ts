/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Adaptations for this project:
 * - The `node:sqlite` `DatabaseSync` handle is injected rather than constructed
 *   from constructor args, so ownership stays with the Effect runtime.
 * - `destroy()` no longer closes the database (the Effect layer does), it only
 *   detaches the cached connection.
 */
import type { DatabaseConnection, Driver, QueryCompiler } from 'kysely'
import { CompiledQuery, createQueryId, IdentifierNode, RawNode } from 'kysely'
import type { DatabaseSync } from 'node:sqlite'
import { NodeSQLiteConnection } from './sqlite-connection.ts'

const SAVEPOINT_COMMANDS = {
  savepoint: 'SAVEPOINT',
  release: 'RELEASE SAVEPOINT',
  rollbackTo: 'ROLLBACK TO SAVEPOINT'
} as const

const savepointCommand = (
  command: (typeof SAVEPOINT_COMMANDS)[keyof typeof SAVEPOINT_COMMANDS],
  savepointName: string
): RawNode =>
  RawNode.createWithChildren([RawNode.createWithSql(command), IdentifierNode.create(savepointName)])

/**
 * Kysely {@link Driver} for `node:sqlite`.
 *
 * `node:sqlite` exposes a single synchronous connection. The driver does not queue callers
 * itself: Kysely's `RuntimeDriver` holds a connection mutex for any adapter that reports
 * `supportsMultipleConnections === false` (the SQLite adapter does), so only one Kysely
 * operation touches the handle at a time and a transaction keeps the connection across awaits.
 * That queue is also the one a caller's abort signal can leave (`db.connection().execute(run,
 * { signal })`, see `DatabaseService.query`). The fork's own mutex sat behind it and never
 * had a waiter, so it was removed.
 */
export class NodeSQLiteDriver implements Driver, AsyncDisposable {
  readonly #db: DatabaseSync
  #connection: NodeSQLiteConnection | undefined

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  get connection(): NodeSQLiteConnection {
    if (typeof this.#connection === 'undefined') {
      throw new Error('Database was not initialized. Run `init` first')
    }
    return this.#connection
  }

  async init(): Promise<void> {
    this.#connection = new NodeSQLiteConnection(this.#db)
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {
    this.#connection = undefined
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy()
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('BEGIN'))
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('COMMIT'))
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('ROLLBACK'))
  }

  async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(savepointCommand(SAVEPOINT_COMMANDS.savepoint, savepointName), createQueryId())
    )
  }

  async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(savepointCommand(SAVEPOINT_COMMANDS.release, savepointName), createQueryId())
    )
  }

  async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(savepointCommand(SAVEPOINT_COMMANDS.rollbackTo, savepointName), createQueryId())
    )
  }
}
