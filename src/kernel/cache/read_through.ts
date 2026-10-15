import { Context, Duration, Effect, Exit, type Schema } from 'effect'
import { type Persistable, PersistedCache, Persistence } from 'effect/persistence'
import { ConfigService } from '../config/service.ts'

/**
 * Whether the current request asked to skip the cache (`?nocache=true`). `runEffect` sets it from
 * the URL, so every read-through honours it with no handler passing a flag around. A bypassed
 * read goes to the source and neither reads nor writes the cache, so it shows what is really
 * stored without changing what other callers are served.
 */
export class CacheBypass extends Context.Reference<boolean>('CacheBypass', {
  defaultValue: () => false
}) {}

/** A failure of the cache itself (the store, or an entry that no longer decodes), not of the lookup. */
const isCacheFailure = (
  error: unknown
): error is Persistence.PersistenceError | Schema.SchemaError =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (error._tag === 'PersistenceError' || error._tag === 'SchemaError')

/** How the cached reads of one request were answered; filled by {@link makeReadThrough}. */
export interface CacheTally {
  hit: number
  miss: number
  bypass: number
}

/**
 * Where a request's cached reads are counted, so the request log can say whether the response
 * came from the cache. `runEffect` provides a fresh tally per request; with none (a command, a
 * test calling a service directly) nothing is counted.
 */
export class CacheTrace extends Context.Reference<CacheTally | undefined>('CacheTrace', {
  defaultValue: () => undefined
}) {}

/**
 * One word for a request's reads: `bypass` if it asked to skip the cache, else `miss` if any read
 * had to go to the source, else `hit`. `undefined` when it read nothing through a cache. A request
 * that mixes hits and misses is a `miss`: some of its answer was fetched.
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
 * - **shared** (`redis`, `cloudflare`): the shared store holds the entry for `CACHE_TTL`, and a
 *   process keeps a copy for `CACHE_LOCAL_TTL` on top, so a busy entry does not cost a round trip
 *   to the store each time.
 *
 * Only a success is kept (a failed lookup is retried by the next call, never replayed). A store
 * that fails is not the request's problem: a read that cannot be served from or written to it
 * falls back to the lookup, and `invalidate` shrugs a store error off, because the entry
 * expires anyway. The `guardBacking` decorator keeps an outage from also making each call wait.
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

  // The lookup runs only when neither the process nor the store had the entry, which is exactly a
  // miss; a read that finishes without having run it was a hit.
  const counted = (key: K) =>
    Effect.flatMap(Effect.service(CacheTrace), (tally) => {
      if (tally !== undefined) tally.miss += 1
      return options.lookup(key)
    })

  const persisted = yield* PersistedCache.make<K, R, 'lookup'>(counted, {
    storeId: `edgy:cache:${options.name}`,
    // The persisted copy exists only for a shared store; for `memory` a zero TTL skips the write.
    timeToLive: (exit) => keep(exit, shared ? cache.ttl : Duration.zero),
    inMemoryCapacity: cache.maxEntries,
    inMemoryTTL: (exit) => keep(exit, shared ? cache.localTtl : cache.ttl),
    requireServicesAt: 'lookup'
  }).pipe(Effect.provideService(Persistence.Persistence, persistence))

  return {
    get: (key: K) =>
      Effect.gen(function* () {
        const tally = yield* Effect.service(CacheTrace)
        if (yield* Effect.service(CacheBypass)) {
          if (tally !== undefined) tally.bypass += 1
          return yield* options.lookup(key)
        }

        const missesBefore = tally?.miss ?? 0
        const value = yield* persisted.get(key).pipe(
          Effect.catchIf(isCacheFailure, (error) =>
            Effect.logWarning(`Cache "${options.name}" unusable; reading the source`, error).pipe(
              Effect.tap(() => Effect.sync(() => tally && (tally.miss += 1))),
              Effect.andThen(options.lookup(key))
            )
          )
        )
        if (tally !== undefined && tally.miss === missesBefore) tally.hit += 1
        return value
      }),
    invalidate: (key: K) =>
      persisted
        .invalidate(key)
        .pipe(
          Effect.catchTag('PersistenceError', (error) =>
            Effect.logWarning(`Cache "${options.name}" could not forget an entry`, error)
          )
        )
  }
})
