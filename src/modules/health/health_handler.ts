import { DatabaseService } from '../../database/service.ts'
import { defineMessageHandler } from '../../kernel/http/handler.ts'

/**
 * `GET /health`: readiness probe. Answers 200 only if a database round trip succeeds, otherwise a 500
 * `Database error`, so a load balancer pulls the instance. `GET /` never touches the database.
 */
export const healthHandler = defineMessageHandler({
  message: 'Service is healthy',
  run: () => DatabaseService.use((database) => database.ping)
})
