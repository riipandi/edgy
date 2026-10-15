/**
 * Portion of this file forked from https://github.com/aidenwallis/kysely-d1
 * (MIT License).
 */
import type { DatabaseConnection, Driver } from 'kysely'
import { D1Connection, type D1Database } from './d1-connection.ts'

const NO_TRANSACTIONS =
  'D1 does not support interactive transactions; use a single statement or D1 batch'

/** Kysely {@link Driver} for a D1 binding. Stateless: the binding is the pool. */
export class D1Driver implements Driver {
  readonly #connection: D1Connection

  constructor(database: D1Database) {
    this.#connection = new D1Connection(database)
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection
  }

  async releaseConnection(): Promise<void> {}

  async beginTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTIONS)
  }

  async commitTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTIONS)
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTIONS)
  }

  async destroy(): Promise<void> {}
}
