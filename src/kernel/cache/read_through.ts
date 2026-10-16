import { Context, Duration, Effect, Exit, type Schema } from 'effect'
import { type Persistable, PersistedCache, Persistence } from 'effect/persistence'
import { ConfigService } from '../config/service.ts'

/**
 * Set when the request asked to skip the cache (`?nocache=true`). A bypassed read goes to the
 * source and neither reads nor writes the cache, so it shows what is stored without changing
 * what other callers are served.
 */
export class CacheBypass extends Context.Reference<boolean>('CacheBypass', {
  defaultValue: () => false
}) {}

/** A cache failure (the store, or an entry that no longer decodes), not a lookup failure. */
const isCacheFailure = (
  error: unknown
): error is Persistence.PersistenceError | Schema.SchemaError =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (error._tag === 'PersistenceError' || error._tag === 'SchemaError')

/** Per-request count of cached reads: hits, misses (went to the lookup) and bypasses. */
export interface CacheTally {
  hit: number
  miss: number
  bypass: number
}

/** Counts a request's cached reads for the request log. Provided fresh per request. */
export class CacheTrace extends Context.Reference<CacheTally | undefined>('CacheTrace', {
  defaultValue: () => undefined
}) {}

/**
 * One word for a request's reads: `bypass` if any read was bypassed, else `miss` if any went to
 * the lookup, else `hit`. `undefined` when no cached read happened. A mix of hits and misses is
 * a `miss`.
 */
export const summarizeTally = (tally: CacheTally): 'hit' | 'miss' | 'bypass' | undefined =>
  tally.bypass > 0 ? 'bypass' : tally.miss > 0 ? 'miss' : tally.hit > 0 ? 'hit' : undefined

export interface ReadThrough<K extends Persistable.Any, E, R> {
  /** The value for `key`: from the cache when it can, otherwise from the lookup (and cached). */
  readonly get: (key: K) => Effect.Effect<Persistable.Success<K>, E, R>
  /** Forgets `key`, so the next read goes to the lookup. Call it after a write that changes it. */
  readonly invalidate: (key: K) => Effect.Effect<void>
}

/**
 * A read-through cache over `lookup`, shaped by the `CACHE_*` configuration:
 *
 * - **off** (`CACHE_ENABLED=false`): every read is the lookup.
 * - **`memory`**: this process's own copy, `CACHE_TTL` long, at most `CACHE_MAX_ENTRIES`.
 * - **shared** (`redis`, `cloudflare`): the store holds the entry for `CACHE_TTL`; each process
 *   also keeps a copy for `CACHE_LOCAL_TTL`, so a hot entry does not cost a store round trip.
 *
 * Only a success is cached; a failed lookup is retried by the next call. A store failure never
 * fails the request: an unreadable or unwritable entry falls back to the lookup, and `invalidate`
 * ignores store errors because the entry expires anyway. Keep the store behind a timeout and
 * cooldown guard, or an outage makes every call wait.
 */
export const makeReadThrough = Effect.fnUntraced(function* <
  K extends Persistable.Any,
  E extends Persistable.Error<K>,
  R
>(options: {
  /** Names the cache in the store (`edgy:cache:<name>:<key>`); one per kind of entry. */
  readonly name: string
  readonly lookup: (key: K) => Effect.Effect<Persistable.Success<K>, E, R>
}) {
  const { cache } = yield* ConfigService
  const persistence = yield* Persistence.Persistence

  if (!cache.enabled) {
    return {
      get: options.lookup,
      invalidate: () => Effect.void
    } satisfies ReadThrough<K, E, R>
  }

  const shared = cache.store !== 'memory'
  const keep = (exit: Exit.Exit<unknown, unknown>, ttl: Duration.Duration): Duration.Duration =>
    Exit.isSuccess(exit) ? ttl : Duration.zero

  // The lookup runs only on a miss in both process and store; a read that never ran it was a hit.
  const counted = (key: K) =>
    Effect.flatMap(Effect.service(CacheTrace), (tally) => {
      if (tally !== undefined) tally.miss += 1
      return options.lookup(key)
    })

  const persisted = yield* PersistedCache.make<K, R, 'lookup'>(counted, {
    storeId: `edgy:cache:${options.name}`,
    // Only a shared store gets a persisted copy; a zero TTL skips the write.
    timeToLive: (exit) => keep(exit, shared ? cache.ttl : Duration.zero),
    inMemoryCapacity: cache.maxEntries,
    inMemoryTTL: (exit) => keep(exit, shared ? cache.localTtl : cache.ttl),
    requireServicesAt: 'lookup'
  }).pipe(Effect.provideService(Persistence.Persistence, persistence))

  // Bumped by every `invalidate`. A read that started before one may hold a value older than it.
  let epoch = 0

  return {
    get: (key: K) =>
      Effect.gen(function* () {
        const tally = yield* Effect.service(CacheTrace)
        if (yield* Effect.service(CacheBypass)) {
          if (tally !== undefined) tally.bypass += 1
          return yield* options.lookup(key)
        }

        const missesBefore = tally?.miss ?? 0
        const epochAtStart = epoch
        const value = yield* persisted.get(key).pipe(
          Effect.catchIf(isCacheFailure, (error) =>
            Effect.logWarning(`Cache "${options.name}" unusable; reading the source`, error).pipe(
              Effect.tap(() => Effect.sync(() => tally && (tally.miss += 1))),
              // An entry that no longer decodes (schema changed in a deploy) would fail on every
              // read until its TTL ends, so drop it.
              Effect.tap(() =>
                error._tag === 'SchemaError'
                  ? Effect.ignore(persisted.invalidate(key))
                  : Effect.void
              ),
              Effect.andThen(options.lookup(key))
            )
          )
        )
        if (tally !== undefined && tally.miss === missesBefore) tally.hit += 1

        // Invalidated while in flight: the lookup may have read before the write and stored after
        // the invalidation, keeping a stale value for the whole TTL. Drop it; the caller still gets
        // its value and the next read looks again.
        if (epoch !== epochAtStart) yield* Effect.ignore(persisted.invalidate(key))
        return value
      }),
    invalidate: (key: K) =>
      Effect.sync(() => {
        epoch += 1
      }).pipe(
        Effect.andThen(persisted.invalidate(key)),
        Effect.catchTag('PersistenceError', (error) =>
          Effect.logWarning(`Cache "${options.name}" could not forget an entry`, error)
        )
      )
  }
})
