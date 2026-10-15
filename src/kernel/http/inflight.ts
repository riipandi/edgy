import { Duration, Effect } from 'effect'

/**
 * Counts requests in flight, so shutdown waits for real work rather than open sockets. A server's
 * `close()` waits for connections, and a socket that never sent a complete request (a speculative
 * preconnect, a half-sent header) would hold it until the timeout.
 */
export interface InFlight {
  readonly enter: () => void
  readonly leave: () => void
  /** Number of requests currently being handled. */
  readonly count: Effect.Effect<number>
  /** The same count, read synchronously, for middleware that decides before any Effect runs. */
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
