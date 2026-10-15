/**
 * The state machine every fail-open store guard shares (the cache stores, the shared rate limiter,
 * the Workers rate-limit binding): healthy, then after a failure **skipped for a cooldown**, then
 * **probed by exactly one call**, then healthy again once that call succeeds.
 *
 * It is pure bookkeeping on a clock the caller supplies, so each guard keeps its own way of
 * calling its store (an Effect, a promise, a timeout) and none repeats the rules:
 *
 * - after a failure, calls are skipped (`enter` says no) until the cooldown ends, so a store
 *   outage costs one slow call, not a timeout on every request;
 * - once the cooldown ends, only the first call is let through to test the store; the others keep
 *   skipping for as long as that probe may take, so a recovering store is not hit by every
 *   waiting caller at once;
 * - a probe that fails starts a new cooldown, and only the failure that *started* the outage is
 *   worth a warning.
 */
export interface FailOpenGate {
  /** Whether a call may reach the store at `now`; `probe` marks the call that tests a recovering one. */
  readonly enter: (now: number) => { readonly allowed: boolean; readonly probe: boolean }
  /** The store answered (an answer such as "limit exceeded" counts): the outage, if any, is over. */
  readonly succeeded: () => void
  /** The store failed or timed out; `true` when this starts an outage (the one to announce). */
  readonly failed: (now: number, probe: boolean) => boolean
}

export const makeFailOpenGate = (options: {
  /** How long the store is skipped after a failure. */
  readonly cooldownMs: number
  /** How long a probe may take; the other callers wait out this much before the next probe. */
  readonly probeMs: number
}): FailOpenGate => {
  let skipUntil = 0

  return {
    enter: (now) => {
      if (now < skipUntil) return { allowed: false, probe: false }
      const probe = skipUntil !== 0
      // No yield separates this write from the read above, and nothing else runs in parallel.
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
