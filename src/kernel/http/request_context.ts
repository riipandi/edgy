import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestContext {
  readonly requestId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Runs `fn` with the request id bound to its whole async chain. Code that runs
 * outside any Effect fiber (Kysely's `log` callback) cannot see `event.context`,
 * so it reads the id from here to correlate its log lines. `run` rather than
 * `enterWith`: workerd implements only the former. Works on Node and on Workers
 * (`nodejs_compat`).
 */
export const runWithRequestId = <A>(requestId: string, fn: () => A): A =>
  storage.run({ requestId }, fn)

/** The id of the request being handled, or `undefined` outside a request. */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId
