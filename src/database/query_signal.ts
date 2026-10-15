import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The abort signal of the Effect fiber that issued the query now running.
 *
 * Kysely's driver interface has no way to hand a query the signal of the request behind it, and a
 * repository's `run(db)` callback is plain Kysely, so the signal travels in the async context
 * instead: `DatabaseService.query` and `transaction` set it, and the SQLite driver reads it, so a
 * query that is still waiting for the single connection when its request is cancelled (a timeout,
 * a client that left) never runs. Without it a `504` could still create the row, and the client's
 * retry would create it twice.
 *
 * `run`, not `enterWith` (workerd does not support `enterWith`); nothing here is read on the D1
 * path, where there is no queue to wait in.
 */
export const queryAbort = new AsyncLocalStorage<AbortSignal>()
