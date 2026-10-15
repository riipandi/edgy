/**
 * Portion of this file forked from https://github.com/wolfie/kysely-node-native-sqlite
 * (ISC License, Copyright 2026 Henrik Paul).
 *
 * Minimal async mutex used to serialise access to the single, synchronous
 * `node:sqlite` connection. Kept as a standalone module so the driver stays
 * focused on Kysely concerns.
 *
 * Waiters form a FIFO queue and `unlock` hands the lock straight to the next
 * one. The forked version woke every waiter on each release and let them race
 * for the lock again: O(n) wake-ups per release, and a late caller could
 * overtake an early one. Plain queries rarely queue (the driver call is
 * synchronous), so this shows up only when a transaction holds the connection
 * across awaits; it was not measurable in the benchmark.
 */
export class Mutex {
  #locked = false
  readonly #waiters: Array<() => void> = []

  lock(): Promise<void> {
    if (!this.#locked) {
      this.#locked = true
      return Promise.resolve()
    }
    return new Promise((resolve) => this.#waiters.push(resolve))
  }

  unlock(): void {
    const next = this.#waiters.shift()
    if (next === undefined) this.#locked = false
    else next()
  }
}
