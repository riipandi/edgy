import { Array as Arr, Clock, Duration, Effect, Exit, Layer, Option } from 'effect'
import { Persistence } from 'effect/persistence'

interface GuardOptions {
  /** Longest one store call may take before it counts as a failure. */
  readonly timeout?: Duration.Input
  /** How long the store is skipped after a failure. */
  readonly cooldown?: Duration.Input
}

/**
 * Wraps one backing store so that a failing, hanging or unreachable store behaves as an empty
 * one: a read is a miss, a write and a removal are no-ops. A cache is an optimisation, so its
 * outage must cost the entries, never the request, and never a wait.
 *
 * Two guards, the same as the rate limiter's: each call has a `timeout`, and after any failure
 * the store is skipped for `cooldown`, so the requests that follow do not each wait out the
 * timeout. When the cooldown ends one call tries again; if it answers, caching resumes. One
 * warning per bypass.
 */
const guardStore = (
  store: Persistence.BackingPersistenceStore,
  name: string,
  options: GuardOptions
): Persistence.BackingPersistenceStore => {
  const timeout = options.timeout ?? '250 millis'
  const cooldownMs = Duration.toMillis(Duration.fromInputUnsafe(options.cooldown ?? '10 seconds'))
  let bypassUntil = 0

  const guarded = <A>(
    run: Effect.Effect<A, Persistence.PersistenceError>,
    fallback: A
  ): Effect.Effect<A> =>
    Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis
      if (startedAt < bypassUntil) return fallback

      const exit = yield* Effect.exit(run.pipe(Effect.timeoutOption(timeout)))
      if (Exit.isSuccess(exit) && Option.isSome(exit.value)) return exit.value.value

      bypassUntil = startedAt + cooldownMs
      yield* Effect.logWarning(
        `Cache store "${name}" ${Exit.isSuccess(exit) ? 'timed out' : 'failed'}; bypassing it for a while`,
        Exit.isSuccess(exit) ? undefined : exit.cause
      )
      return fallback
    })

  return {
    get: (key) => guarded(store.get(key), undefined),
    getMany: (keys) =>
      guarded(
        store.getMany(keys),
        Arr.map(keys, () => undefined)
      ),
    set: (key, value, ttl) => guarded(store.set(key, value, ttl), undefined),
    setMany: (entries) => guarded(store.setMany(entries), undefined),
    remove: (key) => guarded(store.remove(key), undefined),
    clear: guarded(store.clear, undefined)
  }
}

/**
 * Decorates a `BackingPersistence` layer so every store it makes is guarded
 * (see {@link guardStore}). Compose it around the real store, under `Persistence.layer`.
 */
export const guardBacking = <E, R>(
  backing: Layer.Layer<Persistence.BackingPersistence, E, R>,
  options: GuardOptions = {}
): Layer.Layer<Persistence.BackingPersistence, E, R> =>
  Layer.effect(
    Persistence.BackingPersistence,
    Effect.gen(function* () {
      const inner = yield* Persistence.BackingPersistence
      return Persistence.BackingPersistence.of({
        make: (storeId) =>
          inner.make(storeId).pipe(Effect.map((store) => guardStore(store, storeId, options)))
      })
    })
  ).pipe(Layer.provide(backing))
