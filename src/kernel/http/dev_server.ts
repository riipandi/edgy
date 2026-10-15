import type { NodeMiddleware } from 'h3'

/**
 * What `pnpm dev` hands the application: the Vite dev server's middleware stack, which serves the
 * browser assets and the hot-reload channel from the source tree.
 *
 * The launcher (`builder/dev.ts`) and the application are separate module graphs (the launcher is
 * plain Node, the application runs inside Vite's module runner), so the only thing they share is
 * `globalThis`. A registered symbol is the channel: no other code can collide with it, and a
 * production process, which never sets it, behaves as if this file did not exist.
 */
const KEY = Symbol.for('edgy.devServer')

export interface DevServer {
  readonly middleware: NodeMiddleware
  /** Stops the Vite server, which otherwise keeps the process alive after the program is done. */
  readonly close: () => Promise<void>
}

const isDevServer = (value: unknown): value is DevServer =>
  typeof value === 'object' &&
  value !== null &&
  'middleware' in value &&
  typeof value.middleware === 'function'

export const installDevServer = (server: DevServer): void => {
  Reflect.set(globalThis, KEY, server)
}

export const devServer = (): DevServer | undefined => {
  const value: unknown = Reflect.get(globalThis, KEY)
  return isDevServer(value) ? value : undefined
}

/** Stops the dev server if there is one. The entry point calls it when the program has finished. */
export const closeDevServer = (): Promise<void> => devServer()?.close() ?? Promise.resolve()
