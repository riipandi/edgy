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
 *
 * A waiter can be cancelled: when its `signal` aborts before it is handed the
 * lock it leaves the queue and its promise rejects, so work for a request that
 * is already gone never runs.
 */
interface Waiter {
  readonly grant: () => void
}

export class Mutex {
  #locked = false
  readonly #waiters: Array<Waiter> = []

  lock(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) return Promise.reject(signal.reason)
    if (!this.#locked) {
      this.#locked = true
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.#waiters.indexOf(waiter)
        if (index === -1) return // already handed the lock
        this.#waiters.splice(index, 1)
        reject(signal?.reason)
      }
      const waiter: Waiter = {
        grant: () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#waiters.push(waiter)
    })
  }

  unlock(): void {
    const next = this.#waiters.shift()
    if (next === undefined) this.#locked = false
    else next.grant()
  }
}
