import { Effect, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import { Database } from '#/database/adapter.ts'
import type { api } from '#/kernel/http/api.ts'

// The wire path of the liveness probe. The rate-limit middleware bypasses
// this route so a supervisor's restart check survives an unreadable store.
export const livenessPath = '/api/live'

export class HealthApi extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: Schema.Struct({ status: Schema.Literal('ok') }),
    error: HttpApiError.ServiceUnavailable
  }),
  HttpApiEndpoint.get('live', '/live', {
    success: Schema.Struct({ status: Schema.Literal('ok') })
  })
) {}

export const healthHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'health', (handlers) =>
    handlers
      .handle('health', () =>
        Database.use(({ ping }) => ping).pipe(
          Effect.as({ status: 'ok' as const }),
          Effect.catchTag('DatabaseError', () => Effect.fail(new HttpApiError.ServiceUnavailable()))
        )
      )
      .handle('live', () => Effect.succeed({ status: 'ok' as const }))
  )
