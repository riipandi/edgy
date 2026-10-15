import { Effect } from 'effect'
import { DatabaseService } from '../database/service.ts'
import { defineHandler } from '../kernel/http/handler.ts'
import { HealthResponseSchema } from '../schemas/health_schema.ts'

/**
 * `GET /health` — readiness probe.
 *
 * Answers 200 only if a round trip to the database succeeds, otherwise the
 * usual 500 `Database error`, so a load balancer pulls the instance. `GET /`
 * stays a static liveness check that never touches the database.
 */
export const healthHandler = defineHandler({
  response: HealthResponseSchema,
  run: () => DatabaseService.use((database) => database.ping).pipe(Effect.as({ status: 'ok' }))
})
