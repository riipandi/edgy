/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Minimal async mutex used to serialise access to the single, synchronous
 * `node:sqlite` connection. Kept as a standalone module so the driver stays
 * focused on Kysely concerns.
 */
export class Mutex {
  #promise: Promise<void> | undefined
  #resolve: (() => void) | undefined

  async lock(): Promise<void> {
    while (this.#promise) await this.#promise
    const { resolve, promise } = Promise.withResolvers<void>()
    this.#promise = promise
    this.#resolve = resolve
  }

  unlock(): void {
    const resolve = this.#resolve
    this.#promise = undefined
    this.#resolve = undefined
    resolve?.()
  }
}
