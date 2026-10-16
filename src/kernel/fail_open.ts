/**
 * The state machine shared by every fail-open store guard: healthy, then skipped for a cooldown
 * after a failure, then probed by exactly one call, then healthy again once that call succeeds.
 *
 * It is pure bookkeeping on a clock the caller supplies, so each guard keeps its own way of
 * calling its store:
 *
 * - after a failure, calls are skipped until the cooldown ends, so an outage costs one slow call,
 *   not a timeout per request;
 * - when the cooldown ends, one call is let through as the probe and the others keep skipping for
 *   as long as it may take, so a recovering store is not hit by every waiting caller at once;
 * - a failed probe starts a new cooldown; only the failure that started the outage is warned about.
 */
export interface FailOpenGate {
  /**
   * Whether a call may reach the store at `now`. `probe` marks the call testing a recovering
   * store.
   */
  readonly enter: (now: number) => { readonly allowed: boolean; readonly probe: boolean }
  /** The store answered, including with a refusal such as "limit exceeded": the outage is over. */
  readonly succeeded: () => void
  /** The store failed or timed out. Returns `true` when this call starts an outage. */
  readonly failed: (now: number, probe: boolean) => boolean
}

export const makeFailOpenGate = (options: {
  /** How long the store is skipped after a failure. */
  readonly cooldownMs: number
  /** How long a probe may take; other callers are skipped for that long. */
  readonly probeMs: number
}): FailOpenGate => {
  let skipUntil = 0

  return {
    enter: (now) => {
      if (now < skipUntil) return { allowed: false, probe: false }
      const probe = skipUntil !== 0
      // Atomic: no yield between the read above and this write.
      if (probe) skipUntil = now + options.probeMs
      return { allowed: true, probe }
    },
    succeeded: () => {
      skipUntil = 0
    },
    failed: (now, probe) => {
      skipUntil = now + options.cooldownMs
      return !probe
    }
  }
}
