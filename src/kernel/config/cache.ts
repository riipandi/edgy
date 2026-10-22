import { choice, flag, group, int, milliseconds, secret, type ValueOf } from './field.ts'

export const cacheConfig = group(
  {
    enabled: flag('CACHE_ENABLED', true, 'In-memory cache for feature lookups'),
    storage: choice(
      'CACHE_STORAGE',
      ['memory', 'redis'],
      'memory',
      'Where cache entries live: in process memory, or shared Redis'
    ),
    redisUrl: secret(
      'CACHE_REDIS_URL',
      'redis://localhost:6379',
      'Redis connection URL for the redis cache storage'
    ),
    ttl: milliseconds('CACHE_TTL', 30_000, 'Cache entry lifetime in milliseconds', 1),
    maxEntries: int('CACHE_MAX_ENTRIES', 256, 'Maximum in-memory entries per cache', 1)
  },
  'Cache'
)

export type CacheConfig = ValueOf<typeof cacheConfig>
