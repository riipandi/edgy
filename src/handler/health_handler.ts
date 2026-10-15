import { DatabaseService } from '../database/service.ts'
import { defineMessageHandler } from '../kernel/http/handler.ts'

/**
 * `GET /health` — readiness probe.
 *
 * Answers 200 only if a round trip to the database succeeds, otherwise the
 * usual 500 `Database error`, so a load balancer pulls the instance. `GET /`
 * stays a static liveness check that never touches the database.
 */
export const healthHandler = defineMessageHandler({
  message: 'Service is healthy',
  run: () => DatabaseService.use((database) => database.ping)
})
