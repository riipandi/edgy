import { flag, group, int, milliseconds, type ValueOf } from './field.ts'

export const cacheConfig = group(
  {
    enabled: flag('CACHE_ENABLED', true, 'Cache user lookups'),
    ttl: milliseconds('CACHE_TTL', 30_000, 'Cache entry lifetime in milliseconds', 1),
    maxEntries: int('CACHE_MAX_ENTRIES', 256, 'Maximum in-memory entries per cache', 1)
  },
  'Cache'
)

export type CacheConfig = ValueOf<typeof cacheConfig>
