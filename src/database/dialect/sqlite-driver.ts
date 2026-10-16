/**
 * Adapted from https://github.com/wolfie/kysely-node-native-sqlite (ISC, Copyright 2026 Henrik Paul).
 *
 * Differs from upstream: the `DatabaseSync` handle is injected because the Effect runtime owns it.
 * `destroy()` detaches the cached connection and leaves closing the database to the owner.
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
 * Kysely {@link Driver} for `node:sqlite`, which has one synchronous connection. Kysely's runtime
 * serialises operations on it because the SQLite adapter reports no multiple connections, so a
 * transaction keeps the connection across awaits and a caller's abort signal can leave the queue.
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

  /**
   * `IMMEDIATE` takes the write lock at the start, waiting out the busy timeout. A plain `BEGIN`
   * reads first and upgrades later, and under WAL that upgrade fails at once (`database is
   * locked`, the busy timeout is not consulted) when another process committed in between.
   */
  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('BEGIN IMMEDIATE'))
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
