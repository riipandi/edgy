import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestContext {
  readonly requestId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Runs `fn` with the request id bound to its whole async chain, for code outside any Effect fiber
 * (such as Kysely's `log` callback) that cannot see `event.context`. Uses `run`, not `enterWith`,
 * because workerd implements only the former.
 */
export const runWithRequestId = <A>(requestId: string, fn: () => A): A =>
  storage.run({ requestId }, fn)

/** The id of the request being handled, or `undefined` outside a request. */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId
