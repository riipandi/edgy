import { Cache, Effect } from 'effect'
import type { User } from '../../database/schema.ts'

export const makeUserCache = (lookup: (id: string) => Effect.Effect<User | undefined, never>) =>
  Cache.make({
    capacity: 256,
    timeToLive: '30 seconds',
    lookup
  })
