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
import { Mutex } from './sqlite-mutex.ts'

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
 * `node:sqlite` exposes a single synchronous connection, so concurrency is
 * serialised through an async {@link Mutex}: only one Kysely operation touches
 * the handle at a time, mirroring the behaviour of `better-sqlite3`.
 */
export class NodeSQLiteDriver implements Driver, AsyncDisposable {
  readonly #db: DatabaseSync
  readonly #mutex = new Mutex()
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
    await this.#mutex.lock()
    return this.connection
  }

  async releaseConnection(): Promise<void> {
    this.#mutex.unlock()
  }

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
