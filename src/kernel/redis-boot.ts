import { Effect, Schedule } from 'effect'

// A Redis outage at boot must delay serve within a bounded window instead of
// killing it; compose's service_healthy gate closes the common cold-start
// race, this covers a Redis that comes up late. Runtime reads keep degrading
// exactly as before.
export const awaitRedis = <A, E, R>(acquire: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  acquire.pipe(
    Effect.tapError(() => Effect.logWarning('Redis unreachable at boot; retrying')),
    Effect.retry({ times: 30, schedule: Schedule.spaced('1 second') })
  )
