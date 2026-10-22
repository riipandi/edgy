import { Effect, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import type { api } from '#/kernel/http/api.ts'
import { HealthService } from './health_service.ts'

export class HealthApi extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: Schema.Struct({ status: Schema.Literal('ok') }),
    error: HttpApiError.ServiceUnavailable
  })
) {}

export const healthHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'health', (handlers) =>
    handlers.handle('health', () =>
      Effect.gen(function* () {
        const service = yield* HealthService
        yield* service.check
        return { status: 'ok' as const }
      }).pipe(
        Effect.catchTag('DatabaseError', () => Effect.fail(new HttpApiError.ServiceUnavailable()))
      )
    )
  )
