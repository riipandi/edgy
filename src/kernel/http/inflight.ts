import { Duration, Effect } from 'effect'

/**
 * Counts requests that have entered the app and not yet left it, so shutdown can
 * wait for exactly the work that matters instead of for every open socket.
 *
 * A server's own `close()` cannot do that: it waits for *connections*, and a
 * socket that never completed a request (a browser's speculative preconnect, a
 * half-sent header) is neither idle nor in flight, so it keeps `close()` pending
 * until the timeout. Counting requests separates the two cases.
 */
export interface InFlight {
  readonly enter: () => void
  readonly leave: () => void
  /** Number of requests currently being handled. */
  readonly count: Effect.Effect<number>
  /** Same number, read synchronously, for middleware that must decide before any Effect runs. */
  readonly active: () => number
  /** Completes once no request is being handled. Never fails; bound it with a timeout. */
  readonly drained: Effect.Effect<void>
}

const POLL_INTERVAL = Duration.millis(25)

export const makeInFlight = (): InFlight => {
  let active = 0

  const count = Effect.sync(() => active)
  const drained: Effect.Effect<void> = Effect.suspend(() =>
    active === 0 ? Effect.void : Effect.sleep(POLL_INTERVAL).pipe(Effect.andThen(drained))
  )

  return {
    enter: () => {
      active += 1
    },
    leave: () => {
      active -= 1
    },
    count,
    active: () => active,
    drained
  }
}
