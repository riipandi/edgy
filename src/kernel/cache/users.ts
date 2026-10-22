import { Cache, Effect } from 'effect'
import type { User } from '#/database/schema.ts'
import type { CacheConfig } from '#/kernel/config/cache.ts'

export const makeUserCache = <E>(
  config: CacheConfig,
  lookup: (id: string) => Effect.Effect<User | undefined, E>
) =>
  Cache.make({
    capacity: config.maxEntries,
    timeToLive: config.ttl,
    lookup
  })
