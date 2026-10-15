import { Config, ConfigProvider, Effect } from 'effect'
import { choice, flag, group, int, milliseconds, type ValueOf } from './field.ts'

/** Read-through cache for entities fetched by id. */
export const cacheConfig = group(
  {
    enabled: flag('CACHE_ENABLED', true, 'Cache reads; off sends every read to the database'),
    store: choice(
      'CACHE_STORE',
      ['memory', 'redis', 'cloudflare'],
      'memory',
      "Where cached entries live: per process (memory), shared by every instance (redis; Node.js only) or Cloudflare's Cache API (cloudflare; Workers only, per location, not served on workers.dev)"
    ),
    ttl: milliseconds('CACHE_TTL', 30_000, 'How long an entry stays cached', { min: 1 }),
    localTtl: milliseconds(
      'CACHE_LOCAL_TTL',
      5_000,
      'With a shared store, how long a process also keeps its own copy (0 keeps none); bounds how stale another instance can be after a write',
      { min: 0 }
    ),
    maxEntries: int(
      'CACHE_MAX_ENTRIES',
      256,
      'Entries a process keeps in memory, per cache; the oldest are dropped past it'
    )
  },
  {
    title: 'Cache',
    // An enabled cache with no room pays its bookkeeping on every read for nothing.
    transform: (raw) =>
      raw.enabled && raw.maxEntries < 1
        ? Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message: 'CACHE_MAX_ENTRIES must be at least 1 when CACHE_ENABLED is true'
              })
            )
          )
        : Effect.succeed(raw)
  }
)

export type CacheConfig = ValueOf<typeof cacheConfig>
