import { Context, Effect, Layer } from 'effect'
import { Database, type DatabaseError } from '#/database/service.ts'

export class HealthService extends Context.Service<
  HealthService,
  { readonly check: Effect.Effect<void, DatabaseError> }
>()('HealthService') {}

export const HealthServiceLayer = Layer.effect(
  HealthService,
  Effect.map(Database, (database) => HealthService.of({ check: database.ping }))
)
