import { Cache, Effect } from 'effect'
import type { CacheConfig } from '#/kernel/config/cache.ts'
import type { User } from '#/modules/user/user_schema.ts'

export const makeUserCache = <E>(
  config: CacheConfig,
  lookup: (id: string) => Effect.Effect<User | undefined, E>
) =>
  Cache.make({
    capacity: config.maxEntries,
    timeToLive: config.ttl,
    lookup
  })
