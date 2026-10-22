import { Effect } from 'effect'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { HealthService } from './health_service.ts'

export const health = Effect.gen(function* () {
  const service = yield* HealthService
  return yield* service.check.pipe(
    Effect.as(HttpServerResponse.jsonUnsafe({ status: 'ok' })),
    Effect.catchTag('DatabaseError', () =>
      Effect.succeed(
        HttpServerResponse.setStatus(503)(HttpServerResponse.jsonUnsafe({ status: 'unavailable' }))
      )
    )
  )
})
