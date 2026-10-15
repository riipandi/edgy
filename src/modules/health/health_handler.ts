import { Effect } from 'effect'
import { DatabaseService } from '../../database/service.ts'
import type { DatabaseError } from '../../kernel/errors.ts'
import { defineMessageHandler } from '../../kernel/http/handler.ts'

/** How long one probe answers for every caller, so a flood of `/health` is one query a second. */
const PROBE_TTL = '1 second'

/** One cached probe per database service, made on first use. */
const probes = new WeakMap<object, Effect.Effect<void, DatabaseError>>()

/**
 * `GET /health`: readiness probe. Answers 200 only if a database round trip succeeds, otherwise a 500
 * `Database error`, so a load balancer pulls the instance. The round trip is shared for a second,
 * failures included, so a probe flood costs one query and an outage shows within a second.
 * `GET /` never touches the database.
 */
export const healthHandler = defineMessageHandler({
  message: 'Service is healthy',
  run: () =>
    DatabaseService.use(
      (database: DatabaseService['Service']): Effect.Effect<void, DatabaseError> => {
        let probe = probes.get(database)
        if (probe === undefined) {
          probe = Effect.runSync(Effect.cachedWithTTL(database.ping, PROBE_TTL))
          probes.set(database, probe)
        }
        return probe
      }
    )
})
