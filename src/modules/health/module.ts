import { Effect, Schema } from 'effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema'
import { Database } from '#/database/adapter.ts'
import type { api } from '#/kernel/http/api.ts'

const Unhealthy = Schema.Struct({ status: Schema.Literal('unhealthy') }).pipe(
  HttpApiSchema.status(503)
)

export class HealthApi extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: Schema.Struct({ status: Schema.Literal('ok') }),
    error: Unhealthy
  })
) {}

export const healthHandlers = (httpApi: typeof api) =>
  HttpApiBuilder.group(httpApi, 'health', (handlers) =>
    handlers.handle('health', () =>
      Database.use(({ ping }) => ping).pipe(
        Effect.as({ status: 'ok' as const }),
        Effect.catchTag('DatabaseError', () => Effect.fail({ status: 'unhealthy' as const }))
      )
    )
  )
